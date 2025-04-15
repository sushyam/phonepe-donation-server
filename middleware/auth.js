const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    console.log('Auth headers:', req.headers); // Debug log

    // Check for token in Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    console.log('Extracted token:', token ? 'Present' : 'Not present'); // Debug log

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('Decoded token:', decoded); // Debug log

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      message: 'Invalid token',
      error: error.message // Include error message for debugging
    });
  }
};

module.exports = { authenticateToken };
