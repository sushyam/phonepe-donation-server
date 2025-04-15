const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { userService } = require('../services/supabase');

// Register
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Create user with Supabase
    const userData = {
      name,
      phone: req.body.phone || ''
    };

    const { user, error } = await userService.signUp(email, password, userData);

    if (error) {
      return res.status(400).json({ 
        message: error.message || 'Registration failed',
        error: error.message
      });
    }

    // Create token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Return user data
    const userResponse = {
      id: user.id,
      name: userData.name,
      email: user.email
    };

    res.status(201).json({
      message: 'Registration successful',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Server error during registration',
      error: error.message // Include error message for debugging
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Sign in with Supabase
    const { data, error } = await userService.signIn(email, password);

    if (error) {
      // Check if this is an email confirmation error
      if (error.message && error.message.includes('Email not confirmed')) {
        return res.status(401).json({ 
          message: 'Email not confirmed. Please check your inbox for a confirmation email.',
          needsEmailConfirmation: true,
          email: email
        });
      }
      
      return res.status(400).json({ 
        message: error.message || 'Invalid email or password',
        error: error.message
      });
    }

    // Get user profile
    const userProfile = await userService.getUserProfile(data.user.id);

    // Create token
    const token = jwt.sign(
      { userId: data.user.id, email: data.user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Return user data
    const userResponse = {
      id: data.user.id,
      name: userProfile?.name || '',
      email: data.user.email
    };

    res.json({
      message: 'Login successful',
      user: userResponse,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
