const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const testStorage = require('../utils/testStorage');

const router = express.Router();

// Helper function to check if MongoDB is connected
const isMongoConnected = () => mongoose.connection.readyState === 1;

// Register user
router.post('/register', [
  body('username').isLength({ min: 3, max: 30 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password } = req.body;

  if (isMongoConnected()) {
    // MongoDB mode
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      throw new AppError('User already exists with this email or username', 400);
    }

    const user = new User({ username, email, password });
    await user.save();

    const token = generateToken(user._id);

    logger.auth(`New user registered: ${username}`);

    res.status(201).json({
      status: 'success',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } else {
    // Test mode - in-memory storage
    const existingUser = testStorage.findTestUser({ email }) || testStorage.findTestUser({ username });
    if (existingUser) {
      throw new AppError('User already exists with this email or username', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = testStorage.addTestUser({
      username,
      email,
      password: hashedPassword,
      role: 'user',
      settings: {
        emailNotifications: true,
        purchaseAlerts: true,
        maxBudget: 500
      },
      createdAt: new Date()
    });

    const token = generateToken(user._id);

    logger.auth(`New user registered (test mode): ${username}`);

    res.status(201).json({
      status: 'success',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  }
}));

// Login user
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  if (isMongoConnected()) {
    // MongoDB mode
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    logger.auth(`User logged in: ${user.username}`);

    res.json({
      status: 'success',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        settings: user.settings
      }
    });
  } else {
    // Test mode - in-memory storage
    const user = testStorage.findTestUser({ email });
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    user.lastLogin = new Date();

    const token = generateToken(user._id);

    logger.auth(`User logged in (test mode): ${user.username}`);

    res.json({
      status: 'success',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        settings: user.settings
      }
    });
  }
}));

// Get current user
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    status: 'success',
    user: req.user
  });
});

// Get test users (development only)
router.get('/test-users', (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    res.json({
      status: 'success',
      mongoConnected: isMongoConnected(),
      testUsers: testStorage.getTestUsers().map(u => ({
        id: u._id,
        username: u.username,
        email: u.email,
        role: u.role
      }))
    });
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

module.exports = router;