require('dotenv').config();

const config = {
  // PhonePe API credentials
  MERCHANT_ID: process.env.PHONEPE_MERCHANT_ID || 'SU2503281910481883211432',
  CLIENT_SECRET: process.env.PHONEPE_CLIENT_SECRET || '4b5d5335-448b-472d-a78f-d0876d6e9903',
  SALT_INDEX: process.env.PHONEPE_SALT_INDEX || '1',

  // API URLs - always use sandbox in development
  API_URL: process.env.NODE_ENV === 'production'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  
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
