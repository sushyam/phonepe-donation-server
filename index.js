const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const donationRoutes = require('./routes/donations');

// Load environment variables
dotenv.config();

const app = express();

// Enable CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://donate.gomantakgausevak.com'
    : 'http://localhost:3000',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// API routes
app.use('/api/donations', donationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
