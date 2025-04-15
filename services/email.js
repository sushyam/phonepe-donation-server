const emailjs = require('@emailjs/browser');

// Initialize EmailJS with your public key
emailjs.init({
  publicKey: "bQxSII_caD6vUHvur",
  privateKey: "qEgsZ6Wun94H9XPIHtWJ3", // This should be kept secure
});

/**
 * Send a thank you email to the donor after successful payment
 * @param {Object} donationData - The donation data
 * @returns {Promise} - The result of the email sending operation
 */
const sendThankYouEmail = async (donationData) => {
  try {
    console.log('Sending thank you email for donation:', donationData.id || 'Unknown ID');
    
    // Format the date
    const formattedDate = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Prepare the template parameters
    const templateParams = {
      name: donationData.donorInfo?.firstName 
        ? `${donationData.donorInfo.firstName} ${donationData.donorInfo.lastName || ''}`
        : 'Valued Donor',
      email: donationData.donorInfo?.email || 'donor@example.com',
      amount: donationData.amount || 0,
      transaction_id: donationData.paymentId || 'Unknown',
      date: formattedDate,
      receipt_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/thank-you?txnId=${donationData.paymentId || 'unknown'}&status=success`,
    };

    console.log('Email template parameters:', templateParams);

    // Send the email using EmailJS
    const result = await emailjs.send(
      "service_oypn6wo", // Service ID
      "template_8zfforh", // Template ID
      templateParams
    );

    console.log('Thank you email sent successfully:', result.status, result.text);
    return result;
  } catch (error) {
    console.error('Error sending thank you email:', error);
    return { error };
  }
};

/**
 * Send a notification email to the admin about a new donation
 * @param {Object} donationData - The donation data
 * @returns {Promise} - The result of the email sending operation
 */
const sendAdminNotificationEmail = async (donationData) => {
  try {
    console.log('Sending admin notification email for donation:', donationData.id || 'Unknown ID');
    
    // Format the date
    const formattedDate = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Prepare the template parameters
    const templateParams = {
      donor_name: donationData.donorInfo?.firstName 
        ? `${donationData.donorInfo.firstName} ${donationData.donorInfo.lastName || ''}`
        : 'Anonymous Donor',
      donor_email: donationData.donorInfo?.email || 'Not provided',
      donor_phone: donationData.donorInfo?.phone || 'Not provided',
      amount: donationData.amount || 0,
      transaction_id: donationData.paymentId || 'Unknown',
      date: formattedDate,
      donation_type: donationData.type || 'Standard',
      admin_email: process.env.ADMIN_EMAIL || 'admin@example.com',
    };

    console.log('Admin email template parameters:', templateParams);

    // Send the email using EmailJS
    const result = await emailjs.send(
      "service_oypn6wo", // Service ID
      "template_8zfforh", // Template ID - You might want to create a different template for admin notifications
      templateParams
    );

    console.log('Admin notification email sent successfully:', result.status, result.text);
    return result;
  } catch (error) {
    console.error('Error sending admin notification email:', error);
    return { error };
  }
};

module.exports = {
  sendThankYouEmail,
  sendAdminNotificationEmail
};
