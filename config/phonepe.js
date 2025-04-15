require('dotenv').config();

const config = {
  // PhonePe UAT Sandbox API credentials
  MERCHANT_ID: process.env.PHONEPE_MERCHANT_ID || 'M22XT4XESS7D0UAT',
  CLIENT_ID: process.env.PHONEPE_CLIENT_ID || 'M22XT4XESS7D0UAT_250415',
  CLIENT_SECRET: process.env.PHONEPE_CLIENT_SECRET || 'MGU0OTE0MTEtMjU5My00NmQ1LWIwYzMtOWY2NTA0ZDAyMjUx',
  CLIENT_VERSION: process.env.PHONEPE_CLIENT_VERSION || '1',
  GRANT_TYPE: process.env.PHONEPE_GRANT_TYPE || 'client_credentials',
  // SALT_INDEX: process.env.PHONEPE_SALT_INDEX || '', // Not used in OAuth flow

  // API URLs - always use UAT sandbox for testing
  API_URL: process.env.NODE_ENV === 'production'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  // For explicit UAT sandbox endpoint (if required):
  // API_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  
  // URLs - will use development or production based on environment
  REDIRECT_URL: process.env.REDIRECT_URL || (process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3001/api/donations/payment-status' 
    : 'https://phonepe-donation-server.onrender.com/api/donations/payment-status'),
  CALLBACK_URL: process.env.CALLBACK_URL || (process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3001/api/donations/callback' 
    : 'https://phonepe-donation-server.onrender.com/api/donations/callback'),
  
  // Response type
  RESPONSE_TYPE: 'POST',

  // Payment options
  PAYMENT_INSTRUMENT_TYPE: 'PAY_PAGE',
  RESPONSE_TYPE: 'POST'
};

module.exports = config;
