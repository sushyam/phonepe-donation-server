const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/phonepe');

// --- PhonePe OAuth Access Token Fetch ---
async function getPhonePeAccessToken() {
  try {
    const resp = await axios.post(
      'https://api.phonepe.com/oauth/token', // Update if your PhonePe docs specify a different endpoint
      {
        client_id: config.CLIENT_ID,
        client_secret: config.CLIENT_SECRET,
        grant_type: config.GRANT_TYPE
      }
    );
    if (!resp.data.access_token) {
      throw new Error('No access token returned by PhonePe');
    }
    return resp.data.access_token;
  } catch (error) {
    console.error('Failed to fetch PhonePe access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch PhonePe access token');
  }
}

const generatePaymentRequest = async (donation) => {
  let merchantTransactionId, base64Payload, checksum;

  try {
    console.log('Generating payment request for donation:', donation);

    // Generate a unique transaction ID that meets PhonePe's requirements (alphanumeric, max 36 chars)
    const timestamp = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    merchantTransactionId = `MT${timestamp}${randomPart}`;
    console.log('Generated transaction ID:', merchantTransactionId);
    
    // Convert amount to paisa and round
    const amount = Math.round(donation.amount * 100);

    console.log('Payment details:', { 
      merchantId: config.MERCHANT_ID,
      merchantTransactionId,
      amount
    });

    const payload = {
      merchantId: config.MERCHANT_ID || config.CLIENT_ID, // fallback for new/old flows
      merchantTransactionId: merchantTransactionId,
      amount,
      redirectUrl: process.env.NODE_ENV === 'production'
        ? 'https://donate.gomantakgausevak.com/thank-you'
        : 'http://localhost:3000/thank-you',
      redirectMode: 'REDIRECT',
      callbackUrl: process.env.NODE_ENV === 'production'
        ? 'https://phonepe-donation-server.onrender.com/api/donations/callback'
        : 'http://localhost:3001/api/donations/callback',
      merchantUserId: donation.userId ? donation.userId.toString() : 'GUEST',
      mobileNumber: donation.donorInfo?.phone || '',
      deviceContext: {
        deviceOS: 'WEB'
      },
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };


    console.log('Creating payload for payment request');
    base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    
    // --- OAuth/token-based flow: fetch token and use in Authorization header ---
    let token;
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
      token = await getPhonePeAccessToken();
    }

    // Generate checksum (legacy, may not be needed in new flow)
    const string = `${base64Payload}/pg/v1/pay${config.CLIENT_SECRET}`;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    checksum = `${sha256}###${config.SALT_INDEX}`;

    console.log('Making PhonePe API request...');

    // Only use test payment in development with USE_TEST_PAYMENT flag
    if (process.env.NODE_ENV === 'development' && process.env.USE_TEST_PAYMENT === 'true') {
      console.log('Using test payment URL - Development mode');
      return {
        paymentUrl: `${config.REDIRECT_URL}/${merchantTransactionId}`,
        merchantTransactionId,
        base64Payload,
        checksum
      };
    }

    // --- Use Bearer token for modern flow ---
    const response = await axios.post(
      `${config.API_URL}/pg/v1/pay`,
      {
        request: base64Payload
      },
      {
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          // If legacy, may still need X-VERIFY and X-MERCHANT-ID
          ...(token ? {} : {
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': config.MERCHANT_ID
          })
        }
      }
    );

    console.log('PhonePe API response:', response.data);

    if (!response.data.success) {
      console.error('PhonePe API error:', response.data);
      throw new Error(response.data.message || 'Payment initialization failed');
    }

    if (!response.data.data?.instrumentResponse?.redirectInfo?.url) {
      console.error('No redirect URL provided by PhonePe API. Full response:', response.data);
      throw new Error('No redirect URL provided by PhonePe API');
    }

    return {
      paymentUrl: response.data.data.instrumentResponse.redirectInfo.url,
      merchantTransactionId,
      base64Payload,
      checksum
    };
  } catch (error) {
    console.error('Error generating payment request:', error.response?.data || error.message);
    
    // Only use test payment in development with USE_TEST_PAYMENT flag
    if (process.env.NODE_ENV === 'development' && process.env.USE_TEST_PAYMENT === 'true') {
      console.log('Using test payment URL due to error');
      return {
        paymentUrl: `http://localhost:3000/thank-you?txnId=${merchantTransactionId || `TR_${Date.now()}_ERROR`}&status=success`,
        merchantTransactionId: merchantTransactionId || `TR_${Date.now()}_ERROR`,
        base64Payload: base64Payload || '',
        checksum: checksum || '',
        error: error.response?.data || error.message
      };
    }
    
    // In production, throw the error
    throw error;
  }
};

const verifyPayment = async (merchantTransactionId) => {
  // Add delay before verification to allow PhonePe to process
  await new Promise(resolve => setTimeout(resolve, 2000));
  try {
    console.log('Verifying payment for transaction:', merchantTransactionId);

    // Only use this in development mode for testing
    if (process.env.NODE_ENV === 'development' && process.env.USE_TEST_PAYMENT === 'true') {
      console.log('Using test verification response');
      return {
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment successful',
        data: {
          merchantId: config.MERCHANT_ID,
          merchantTransactionId,
          transactionId: `TEST_${merchantTransactionId}`,
          amount: 5000,
          status: 'COMPLETED'
        }
      };
    }

    // Generate checksum for verification
    const string = `/pg/v1/status/${config.MERCHANT_ID}/${merchantTransactionId}${config.CLIENT_SECRET}`;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const checksum = `${sha256}###${config.SALT_INDEX}`;
    
    console.log('Verification request details:', {
      url: `${config.API_URL}/pg/v1/status/${config.MERCHANT_ID}/${merchantTransactionId}`,
      checksum,
      merchantId: config.MERCHANT_ID
    });

    console.log('Making payment verification request to PhonePe');
    const response = await axios.get(
      `${config.API_URL}/pg/v1/status/${config.MERCHANT_ID}/${merchantTransactionId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': config.MERCHANT_ID
        }
      }
    );

    console.log('Payment verification response from PhonePe:', response.data);
    
    // Add additional validation
    if (!response.data || !response.data.code) {
      throw new Error('Invalid response from PhonePe');
    }
    return response.data;
  } catch (error) {
    // Log the full error details for debugging
    if (error.response) {
      console.error('Error verifying payment - response data:', error.response.data);
      console.error('Error verifying payment - status:', error.response.status);
      console.error('Error verifying payment - headers:', error.response.headers);
    } else {
      console.error('Error verifying payment:', error.message);
    }
    
    // Only use test response in development mode
    if (process.env.NODE_ENV === 'development' && process.env.USE_TEST_PAYMENT === 'true') {
      console.log('Using test verification response due to error');
      return {
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment successful',
        data: {
          merchantId: config.MERCHANT_ID,
          merchantTransactionId,
          transactionId: `TEST_${merchantTransactionId}`,
          amount: 5000,
          status: 'COMPLETED'
        }
      };
    }
    // In production, throw a more informative error
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error verifying payment';
    const errorCode = error.response?.data?.code || 'UNKNOWN_ERROR';
    throw new Error(`PhonePe payment verification failed [${errorCode}]: ${errorMsg}`);
  }
};

module.exports = {
  generatePaymentRequest,
  verifyPayment
};
