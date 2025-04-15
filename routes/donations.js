const express = require('express');
const jwt = require('jsonwebtoken');
const { generatePaymentRequest, verifyPayment } = require('../services/payment');
const { generateReceipt, sendReceiptEmail } = require('../services/receipt');
const { authenticateToken } = require('../middleware/auth');
const config = require('../config/phonepe');
const fs = require('fs');
const donationService = require('../services/supabase');
const userService = require('../services/supabase').userService;
const { sendThankYouEmail, sendAdminNotificationEmail } = require('../services/email');

const router = express.Router();



// Create a new general donation (no auth required)
router.post('/', async (req, res) => {
  try {
    const { amount, donorInfo, donationType, donationId } = req.body;
    console.log('Creating general donation:', { amount, donorInfo, donationType, donationId });

    // Validate required fields
    if (!amount || !donorInfo || !donationType) {
      return res.status(400).json({
        message: 'Missing required fields',
        required: { amount: !!amount, donorInfo: !!donorInfo, donationType: !!donationType }
      });
    }

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 100) {
      return res.status(400).json({
        message: 'Invalid amount. Must be a number greater than or equal to 100'
      });
    }

    // Create donation record
    const donationData = {
      userId: 'GUEST', // Use GUEST for non-authenticated donations
      type: donationType.toLowerCase(),
      amount: numericAmount,
      donorInfo: {
        ...donorInfo,
        email: donorInfo.email?.toLowerCase()
      },
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Save donation to Supabase
    const donation = await donationService.createDonation(donationData);

    // Generate payment request
    const { paymentUrl, merchantTransactionId } = await generatePaymentRequest(donation);

    // Update donation with transaction ID
    await donationService.updateDonation(donation.id, { paymentId: merchantTransactionId });

    res.status(201).json({
      message: 'Donation created successfully',
      donation,
      paymentUrl
    });
  } catch (error) {
    console.error('Error creating donation:', error);
    res.status(500).json({ message: 'Error creating donation' });
  }
});

// Get all donations for a user (auth required)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userDonations = await donationService.getDonationsByUserId(req.user.userId);
    res.json(userDonations);
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ message: 'Error fetching donations' });
  }
});

// Get a specific donation (auth required)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const donation = await donationService.getDonationById(req.params.id);
    if (!donation || donation.userId !== req.user.userId) {
      return res.status(404).json({ message: 'Donation not found' });
    }
    res.json(donation);
  } catch (error) {
    console.error('Error fetching donation:', error);
    res.status(500).json({ message: 'Error fetching donation' });
  }
});

// Update donation status after payment
router.all('/payment-status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    console.log('Checking payment status for transaction:', transactionId);

    // Find donation by transaction ID first
    const donation = await donationService.findDonationByPaymentId(transactionId);
    if (!donation) {
      console.log('Donation not found for transaction ID:', transactionId);
      return res.redirect('/thank-you?status=failed&message=Invalid+transaction+ID');
    }
    
    // For development mode with test payment flag
    if (process.env.NODE_ENV === 'development' && process.env.USE_TEST_PAYMENT === 'true') {
      console.log('Development mode: Returning success for test transaction');
      
      await donationService.updateDonation(donation.id, {
        status: 'completed',
        paymentDetails: {
          transactionId,
          status: 'COMPLETED',
          code: 'PAYMENT_SUCCESS'
        }
      });

      try {
        await sendThankYouEmail(donation);
        console.log('Development mode: Thank you email sent');
        
        await sendAdminNotificationEmail(donation);
        console.log('Development mode: Admin notification email sent');
      } catch (emailError) {
        console.error('Error sending emails in development mode:', emailError);
      }
      
      return res.redirect('/thank-you?status=success');
    }
    
    // Wait for a few seconds before verifying payment
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify payment status with PhonePe
    console.log('Verifying payment with PhonePe...');
    const paymentStatus = await verifyPayment(transactionId);
    console.log('Payment verification response:', paymentStatus);

    // Update donation status based on payment status
    if (paymentStatus.code === 'PAYMENT_SUCCESS' && donation.status !== 'completed') {
      console.log('Payment successful, updating donation status...');
      await donationService.updateDonation(donation.id, {
        status: 'completed',
        paymentDetails: {
          transactionId,
          code: paymentStatus.code,
          status: paymentStatus.data?.status,
          verificationResponse: paymentStatus
        }
      });
      
      // Send thank you email after successful payment
      try {
        const updatedDonation = await donationService.getDonationById(donation.id);
        await sendThankYouEmail(updatedDonation);
        console.log('Thank you email sent for donation:', donation.id);
        
        // Also send admin notification
        await sendAdminNotificationEmail(updatedDonation);
        console.log('Admin notification email sent for donation:', donation.id);
      } catch (emailError) {
        console.error('Error sending emails after payment verification:', emailError);
      }

      // If payment is successful, generate and send receipt
      if (donation.status === 'completed') {
        try {
          const pdfPath = await generateReceipt(donation);
          await sendReceiptEmail(donation, pdfPath);
          
          // Also send thank you email with EmailJS (as a backup in case the earlier one failed)
          try {
            await sendThankYouEmail(donation);
            console.log('Thank you email sent via EmailJS for donation:', donation.id);
          } catch (emailError) {
            console.error('Error sending EmailJS thank you email:', emailError);
          }
        } catch (error) {
          console.error('Error handling receipt:', error);
        }
      }

      return res.redirect('/thank-you?status=success');
    }

    // Get updated donation
    const updatedDonation = await donationService.getDonationById(donation.id);

    return res.redirect(`/thank-you?status=${updatedDonation.status}`);
  } catch (error) {
    console.error('Error checking payment status:', error);
    console.error('Error checking payment status:', error);
    return res.redirect('/thank-you?status=failed&message=Payment+verification+failed');
  }
});

// Payment callback endpoint
router.all('/callback', async (req, res) => {
  try {
    const { merchantTransactionId, transactionId, code, status } = req.body;
    console.log('Payment callback received:', req.body);

    // Find donation by transaction ID
    const donation = await donationService.findDonationByPaymentId(merchantTransactionId);
    if (!donation) {
      console.error('Donation not found for transaction:', merchantTransactionId);
      return res.status(404).json({ message: 'Donation not found' });
    }

    // Verify payment status
    const paymentStatus = await verifyPayment(merchantTransactionId);
    console.log('Payment verification response:', paymentStatus);

    // Update donation with payment details
    const newStatus = paymentStatus.code === 'PAYMENT_SUCCESS' ? 'completed' : 'failed';
    await donationService.updateDonation(donation.id, {
      status: newStatus,
      paymentDetails: {
        transactionId,
        code,
        status,
        verificationResponse: paymentStatus
      }
    });

    // Get updated donation
    const updatedDonation = await donationService.getDonationById(donation.id);

    // If payment is successful, generate and send receipt
    if (updatedDonation.status === 'completed') {
      try {
        console.log('Generating receipt for donation:', updatedDonation.id);
        const pdfPath = await generateReceipt(updatedDonation);
        console.log('Receipt generated:', pdfPath);

        await sendReceiptEmail(updatedDonation, pdfPath);
        console.log('Receipt email sent to:', updatedDonation.donorInfo.email);
        
        // Send thank you email with EmailJS
        try {
          await sendThankYouEmail(updatedDonation);
          console.log('Thank you email sent via EmailJS for donation:', updatedDonation.id);
          
          // Also send admin notification
          await sendAdminNotificationEmail(updatedDonation);
          console.log('Admin notification email sent for donation:', updatedDonation.id);
        } catch (emailError) {
          console.error('Error sending EmailJS emails:', emailError);
        }

        // Return success response with receipt URL
        return res.json({
          message: 'Payment successful and receipt sent',
          status: 'success',
          donation: updatedDonation,
          receiptUrl: `/api/donations/${updatedDonation.id}/receipt`
        });
      } catch (error) {
        console.error('Error handling receipt:', error);
      }
    }

    res.json({
      message: `Payment ${donation.status}`,
      status: donation.status,
      donation
    });
  } catch (error) {
    console.error('Error processing payment callback:', error);
    res.status(500).json({ message: 'Error processing payment callback' });
  }
});

// Download receipt
router.get('/:id/receipt', authenticateToken, async (req, res) => {
  try {
    const donation = await donationService.getDonationById(req.params.id);
    if (!donation || donation.userId !== req.user.userId || donation.status !== 'completed') {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    // Generate receipt
    const pdfPath = await generateReceipt(donation);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt_${donation.id}.pdf`);

    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    // Delete file after streaming
    fileStream.on('end', () => {
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({ message: 'Error generating receipt' });
  }
});

// Create a new individual donation (auth required)
router.post('/individual', async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const { donorInfo, amount, createAccount } = req.body;

    if (!donorInfo || !donorInfo.email || !amount) {
      return res.status(400).json({
        message: 'Missing required fields'
      });
    }
    
    // Determine user ID - if authenticated, use that, otherwise use GUEST
    let userId = 'GUEST';
    let user = null;
    
    // If token is provided, verify it
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
        user = { userId: decoded.userId, email: decoded.email };
      } catch (tokenError) {
        console.log('Invalid token, continuing as guest');
      }
    }
    
    // If createAccount is true and we don't have a user yet, create one
    if (createAccount && userId === 'GUEST') {
      try {
        // Check if user with this email already exists
        const existingUser = await userService.getUserByEmail(donorInfo.email);
        
        if (existingUser) {
          userId = existingUser.id;
          user = existingUser;
        } else {
          // Create new user
          const newUser = await userService.createUser({
            email: donorInfo.email.toLowerCase(),
            name: donorInfo.name,
            phone: donorInfo.phone,
            address: donorInfo.address,
            city: donorInfo.city,
            state: donorInfo.state,
            pincode: donorInfo.pincode,
            pan: donorInfo.pan,
            createdAt: new Date().toISOString()
          });
          
          userId = newUser.id;
          user = newUser;
        }
      } catch (userError) {
        console.error('Error creating/finding user:', userError);
        // Continue as guest if user creation fails
      }
    }

    // Create donation with user ID
    const donationData = {
      userId: userId,
      type: 'individual',
      amount: Number(amount),
      donorInfo: {
        ...donorInfo,
        email: donorInfo.email.toLowerCase()
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      frequency: req.body.frequency || 'yearly'
    };

    // Save donation to Supabase
    const donation = await donationService.createDonation(donationData);

    try {
      // Generate payment request
      const { paymentUrl, merchantTransactionId } = await generatePaymentRequest(donation);
      
      // Update donation with payment ID
      await donationService.updateDonation(donation.id, { paymentId: merchantTransactionId });

      // Generate JWT token for auto-login if we have a user
      let token = null;
      let userData = null;
      
      if (user && userId !== 'GUEST') {
        token = jwt.sign(
          { userId: user.userId || user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        userData = {
          _id: user.userId || user.id,
          name: user.name,
          email: user.email
        };
        
        // Update last login time if we have a userService
        if (typeof userService !== 'undefined' && userService.updateUser) {
          await userService.updateUser(user.userId || user.id, { lastLoginAt: new Date().toISOString() });
        }
      }

      res.status(201).json({
        message: 'Donation initiated successfully',
        donation,
        paymentUrl,
        user: userData,
        token
      });
    } catch (paymentError) {
      console.error('Payment generation error:', paymentError);
      // Delete the saved donation since payment failed
      await donationService.deleteDonation(donation.id);
      throw paymentError;
    }
  } catch (error) {
    console.error('Error creating donation:', error);
    res.status(500).json({
      message: error.message || 'Error creating donation',
      error: error.message
    });
  }
});

// Create a new family donation (auth required)
router.post('/family', authenticateToken, async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const { donorInfo, amount, familyInfo } = req.body;

    if (!donorInfo || !donorInfo.email || !amount) {
      return res.status(400).json({
        message: 'Missing required fields'
      });
    }

    // Create donation with user ID
    const donationData = {
      userId: req.user.userId,
      type: 'family',
      amount: Number(amount),
      donorInfo: {
        ...donorInfo,
        email: donorInfo.email.toLowerCase()
      },
      familyInfo,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Save donation to Supabase
    const donation = await donationService.createDonation(donationData);

    try {
      // Generate payment request
      const { paymentUrl, merchantTransactionId } = await generatePaymentRequest(donation);
      
      // Update donation with payment ID
      await donationService.updateDonation(donation.id, { paymentId: merchantTransactionId });

      res.status(201).json({
        message: 'Family donation created successfully',
        donation,
        paymentUrl
      });
    } catch (paymentError) {
      console.error('Payment generation error:', paymentError);
      // Delete the saved donation since payment failed
      await donationService.deleteDonation(donation.id);
      throw paymentError;
    }
  } catch (error) {
    console.error('Error creating donation:', error);
    res.status(500).json({
      message: error.message || 'Error creating donation',
      error: error.message
    });
  }
});

// Update donation status (auth required)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, paymentId } = req.body;
    const donation = await donationService.getDonationById(req.params.id);
    
    if (!donation || donation.userId !== req.user.userId) {
      return res.status(404).json({ message: 'Donation not found' });
    }

    // Update donation status
    await donationService.updateDonation(donation.id, { status, paymentId });

    // Get updated donation
    const updatedDonation = await donationService.getDonationById(donation.id);

    // If status is pending, generate new payment URL
    if (status === 'pending') {
      const { paymentUrl, merchantTransactionId } = await generatePaymentRequest(updatedDonation);
      await donationService.updateDonation(donation.id, { paymentId: merchantTransactionId });

      return res.json({
        message: 'Payment URL generated successfully',
        donation: updatedDonation,
        paymentUrl
      });
    }

    res.json({
      message: 'Donation status updated successfully',
      donation: updatedDonation
    });
  } catch (error) {
    console.error('Error updating donation status:', error);
    res.status(500).json({ message: 'Error updating donation status' });
  }
});

module.exports = router;
