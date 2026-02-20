const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const testStorage = require('../utils/testStorage');

// Helper function to check if MongoDB is connected
const isMongoConnected = () => mongoose.connection.readyState === 1;

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user;
    if (isMongoConnected()) {
      user = await User.findById(decoded.userId).select('-password');
    } else {
      // Test mode - find in memory
      user = testStorage.findTestUser({ _id: decoded.userId });
      if (user) {
        // Remove password from response
        user = { ...user, password: undefined };
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (user.isActive === false) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// Verify token without throwing error (for optional auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      let user;
      if (isMongoConnected()) {
        user = await User.findById(decoded.userId).select('-password');
      } else {
        // Test mode
        user = testStorage.findTestUser({ _id: decoded.userId });
        if (user) {
          user = { ...user, password: undefined };
        }
      }
      
      if (user && user.isActive !== false) {
        req.user = user;
      }
    }
  } catch (error) {
    // Continue without user
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  generateToken,
  optionalAuth
};