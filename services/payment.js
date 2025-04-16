const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/phonepe');

// --- Debug helper to print full request and response ---
const debugPhonePeAPI = true; // Set to true to see detailed logs

function logDebug(message, data) {
  if (debugPhonePeAPI) {
    console.log(`[PhonePe Debug] ${message}:`, JSON.stringify(data, null, 2));
  }
}

// Generate SHA256 + salt index
function generateX_VERIFY(base64Payload, url, saltKey, saltIndex) {
  const string = `${base64Payload}${url}${saltKey}`;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return `${sha256}###${saltIndex}`;
}

// --- PhonePe OAuth Access Token Fetch ---
async function getPhonePeAccessToken() {
  try {
    logDebug('Fetching OAuth token with credentials', {
      client_id: config.CLIENT_ID,
      client_secret: `${config.CLIENT_SECRET.substring(0, 5)}...`, // Log only part of secret
      grant_type: config.GRANT_TYPE
    });
    
    const resp = await axios.post(
      'https://api-preprod.phonepe.com/apis/oauth/token', // Updated to match UAT sandbox
      {
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
        grant_type: config.GRANT_TYPE,
        client_version: config.CLIENT_VERSION
      }
    );
    
    logDebug('OAuth token response', resp.data);
    
    if (!resp.data.access_token) {
      throw new Error('No access token in PhonePe response');
    }
    return resp.data.access_token;
  } catch (error) {
    console.error('Failed to fetch PhonePe access token:', error.response?.data || error.message);
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response headers:', error.response.headers);
    }
    throw new Error('Failed to fetch PhonePe access token');
  }
}

const generatePaymentRequest = async (donation) => {
  try {
    // Generate a unique merchant order ID
    const merchantTransactionId = `MT_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    // Convert amount to paisa
    const amountInPaisa = Math.round(donation.amount * 100);

    // Prepare the standard checkout request
    const payload = {
      merchantId: config.MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      amount: amountInPaisa,
      redirectUrl: process.env.NODE_ENV === 'production'
        ? 'https://donate.gomantakgausevak.com/thank-you'
        : 'http://localhost:3000/thank-you',
      redirectMode: "REDIRECT",
      callbackUrl: `${process.env.NODE_ENV === 'production'
        ? 'https://phonepe-donation-server.onrender.com'
        : 'http://localhost:3001'}/api/donations/callback`,
      paymentInstrument: {
        type: "PAY_PAGE"
      }
    };

    // Add optional user info if available
    if (donation.donorInfo?.phone) {
      payload.mobileNumber = donation.donorInfo.phone;
    }
    if (donation.userId) {
      payload.merchantUserId = donation.userId;
    }

    logDebug('Standard checkout request payload', payload);

    // Convert payload to base64
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    
    // Generate checksum
    const checksum = generateX_VERIFY(
      base64Payload,
      '/pg/v1/pay',
      config.SALT_KEY,
      config.SALT_INDEX
    );

    // Make the payment request
    const response = await axios.post(
      `${config.API_URL}/pg/v1/pay`,
      {
        request: base64Payload
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': config.MERCHANT_ID
        }
      }
    );

    logDebug('PhonePe standard checkout response', response.data);

    // Validate response
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Payment initialization failed');
    }

    // Extract redirect URL
    const checkoutPageUrl = response.data.data?.instrumentResponse?.redirectInfo?.url;
    if (!checkoutPageUrl) {
      throw new Error('No checkout page URL in response');
    }

    return {
      paymentUrl: checkoutPageUrl,
      merchantTransactionId
    };

  } catch (error) {
    console.error('Error generating payment request:', error);
    
    // In development, provide a test URL
    if (process.env.NODE_ENV === 'development') {
      return {
        paymentUrl: `http://localhost:3000/thank-you?txnId=TEST_${Date.now()}&status=success`,
        merchantTransactionId: `TEST_${Date.now()}`
      };
    }
    
    throw error;
  }
};

const verifyPayment = async (transactionId) => {
  try {
    // In development mode, always return success
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        code: "PAYMENT_SUCCESS",
        message: "Payment verified successfully",
        data: {
          merchantId: config.MERCHANT_ID,
          merchantTransactionId: transactionId,
          transactionId: transactionId,
          amount: 100,
          state: "COMPLETED",
          responseCode: "SUCCESS",
          paymentInstrument: {
            type: "UPI"
          }
        }
      };
    }

    logDebug('Verifying payment status', { transactionId });

    // Generate checksum for status check
    const statusPath = `/pg/v1/status/${config.MERCHANT_ID}/${transactionId}`;
    const checksum = generateX_VERIFY(
      "", // Empty string for GET requests
      statusPath,
      config.SALT_KEY,
      config.SALT_INDEX
    );

    // Make status check request
    const response = await axios.get(
      `${config.API_URL}${statusPath}`,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': config.MERCHANT_ID
        }
      }
    );

    logDebug('Payment status response', response.data);

    // Validate response
    if (!response.data?.success) {
      const errorMsg = response.data?.message || 'Payment verification failed';
      logDebug('Payment verification error', { error: errorMsg });
      throw new Error(errorMsg);
    }

    // Check payment status
    const paymentData = response.data.data;
    if (!paymentData) {
      throw new Error('No payment data in response');
    }

    if (paymentData.state !== 'COMPLETED') {
      throw new Error(`Payment not completed. Current state: ${paymentData.state}`);
    }

    if (paymentData.responseCode !== 'SUCCESS') {
      throw new Error(`Payment unsuccessful. Response code: ${paymentData.responseCode}`);
    }

    return response.data;
  } catch (error) {
    console.error('Payment verification failed:', error.message);

    // In development, simulate success
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        code: "PAYMENT_SUCCESS",
        message: "Payment verified successfully (simulated)",
        data: {
          merchantId: config.MERCHANT_ID,
          merchantTransactionId: transactionId,
          transactionId: transactionId,
          amount: 100,
          state: "COMPLETED",
          responseCode: "SUCCESS",
          paymentInstrument: {
            type: "UPI"
          }
        }
      };
    }

    throw error;
  }
};

module.exports = {
  generatePaymentRequest,
  verifyPayment
};
