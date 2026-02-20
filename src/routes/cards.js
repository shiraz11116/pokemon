const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const CreditCard = require('../models/CreditCard');
const { authenticateToken } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const testStorage = require('../utils/testStorage');

const router = express.Router();

// Test mode storage for credit cards - now using testStorage
// let testCreditCards = []; // Removed - now using testStorage
// let cardIdCounter = 1;    // Removed - now using testStorage

// Check if in test mode
const isTestMode = !process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/pokemon-cards';

// Note: Mock credit cards now loaded from testStorage.js
// All credit card operations use testStorage functions for persistence

// All routes require authentication
router.use(authenticateToken);

// Get all credit cards for user
router.get('/', catchAsync(async (req, res) => {
  if (isTestMode) {
    // Test mode - using testStorage
    const userCards = testStorage.findTestCreditCards({ 
      createdBy: req.user._id,
      isActive: true 
    });
    
    res.json({
      status: 'success',
      results: userCards.length,
      cards: userCards
    });
    return;
  }
  
  // MongoDB mode
  const cards = await CreditCard.find({ 
    createdBy: req.user._id,
    isActive: true 
  }).sort({ isDefault: -1, createdAt: -1 });
  
  res.json({
    status: 'success',
    results: cards.length,
    cards
  });
}));

// Get single credit card
router.get('/:id', catchAsync(async (req, res) => {
  if (isTestMode) {
    // Test mode - using testStorage
    const card = testStorage.findTestCreditCard({ _id: req.params.id });
    
    if (!card || card.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('Credit card not found', 404);
    }
    
    res.json({
      status: 'success',
      card
    });
    return;
  }
  
  // MongoDB mode
  const card = await CreditCard.findOne({ 
    _id: req.params.id, 
    createdBy: req.user._id 
  });
  
  if (!card) {
    throw new AppError('Credit card not found', 404);
  }
  
  res.json({
    status: 'success',
    card
  });
}));

// Add new credit card
router.post('/', [
  body('cardName').notEmpty().trim(),
  body('cardNumber').isLength({ min: 13, max: 19 }).isNumeric(),
  body('cvv').isLength({ min: 3, max: 4 }).isNumeric(),
  body('expiryMonth').matches(/^(0[1-9]|1[0-2])$/),
  body('expiryYear').matches(/^20[2-9][0-9]$/),
  body('cardholderName').notEmpty().trim(),
  body('billingAddress.street').notEmpty().trim(),
  body('billingAddress.city').notEmpty().trim(),
  body('billingAddress.state').notEmpty().trim(),
  body('billingAddress.zipCode').notEmpty().trim()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  if (isTestMode) {
    // Test mode - using testStorage
    const { cardNumber, cvv, ...cardData } = req.body;
    
    // Simple card type detection for test mode
    let cardType = 'visa';
    if (cardNumber.startsWith('5')) cardType = 'mastercard';
    else if (cardNumber.startsWith('4')) cardType = 'visa';
    else if (cardNumber.startsWith('3')) cardType = 'amex';
    
    const newCard = testStorage.addTestCreditCard({
      ...cardData,
      encryptedCardNumber: `****-****-****-${cardNumber.slice(-4)}`,
      encryptedCVV: '***',
      cardType,
      isActive: true,
      isDefault: false,
      createdBy: req.user._id
    });
    
    logger.info(`New credit card added (test mode): ${newCard.cardName} by ${req.user.email}`);
    
    res.status(201).json({
      status: 'success',
      card: newCard
    });
    return;
  }
  
  // MongoDB mode
  const { cardNumber, cvv, ...cardData } = req.body;
  
  // Encrypt sensitive data
  const encryptedCardNumber = CreditCard.encryptCardData(cardNumber);
  const encryptedCVV = CreditCard.encryptCardData(cvv);
  
  // Detect card type
  const cardType = detectCardType(cardNumber);
  
  const card = new CreditCard({
    ...cardData,
    encryptedCardNumber,
    encryptedCVV,
    cardType,
    createdBy: req.user._id
  });
  
  await card.save();
  
  logger.info(`New credit card added: ${card.cardName} by ${req.user.username}`);
  
  res.status(201).json({
    status: 'success',
    card
  });
}));

// Update credit card
router.put('/:id', [
  body('cardName').optional().notEmpty().trim(),
  body('websites').optional().isArray()
], catchAsync(async (req, res) => {
  if (isTestMode) {
    // Test mode - using testStorage
    const card = testStorage.findTestCreditCard({ _id: req.params.id });
    
    if (!card || card.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('Credit card not found', 404);
    }
    
    // Update allowed fields only
    const allowedUpdates = ['cardName', 'websites', 'billingAddress'];
    const updates = {};
    
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });
    
    const updatedCard = testStorage.updateTestCreditCard(req.params.id, updates);
    
    res.json({
      status: 'success',
      card: updatedCard
    });
    return;
  }
  
  // MongoDB mode
  const card = await CreditCard.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });
  
  if (!card) {
    throw new AppError('Credit card not found', 404);
  }
  
  // Update non-sensitive fields only
  const allowedUpdates = ['cardName', 'websites', 'billingAddress'];
  const updates = {};
  
  Object.keys(req.body).forEach(key => {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  });
  
  Object.assign(card, updates);
  await card.save();
  
  res.json({
    status: 'success',
    card
  });
}));

// Set as default card
router.patch('/:id/set-default', catchAsync(async (req, res) => {
  if (isTestMode) {
    // Test mode - using testStorage
    const userCards = testStorage.findTestCreditCards({ createdBy: req.user._id });
    
    // First remove default from all user cards
    userCards.forEach(card => {
      if (card.isDefault) {
        testStorage.updateTestCreditCard(card._id, { isDefault: false });
      }
    });
    
    // Find and set the target card as default
    const card = testStorage.findTestCreditCard({ _id: req.params.id });
    
    if (!card || card.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('Credit card not found', 404);
    }
    
    const updatedCard = testStorage.updateTestCreditCard(req.params.id, { isDefault: true });
    
    res.json({
      status: 'success',
      message: 'Default card updated',
      card: updatedCard
    });
    return;
  }
  
  // MongoDB mode
  // Remove default from all other cards
  await CreditCard.updateMany(
    { createdBy: req.user._id },
    { isDefault: false }
  );
  
  // Set this card as default
  const card = await CreditCard.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user._id },
    { isDefault: true },
    { new: true }
  );
  
  if (!card) {
    throw new AppError('Credit card not found', 404);
  }
  
  res.json({
    status: 'success',
    message: 'Default card updated',
    card
  });
}));

// Delete credit card
router.delete('/:id', catchAsync(async (req, res) => {
  if (isTestMode) {
    // Test mode - using testStorage
    const card = testStorage.findTestCreditCard({ _id: req.params.id });
    
    if (!card || card.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('Credit card not found', 404);
    }
    
    const deletedCard = testStorage.deleteTestCreditCard(req.params.id);
    
    logger.info(`Credit card deleted (test mode): ${deletedCard.cardName} by ${req.user.email}`);
    
    res.status(204).json({
      status: 'success',
      message: 'Credit card deleted successfully'
    });
    return;
  }
  
  // MongoDB mode
  const card = await CreditCard.findOneAndDelete({
    _id: req.params.id,
    createdBy: req.user._id
  });
  
  if (!card) {
    throw new AppError('Credit card not found', 404);
  }
  
  logger.info(`Credit card deleted: ${card.cardName} by ${req.user.username}`);
  
  res.status(204).json({
    status: 'success',
    message: 'Credit card deleted successfully'
  });
}));

// Helper function to detect card type
function detectCardType(cardNumber) {
  const firstDigit = cardNumber.charAt(0);
  const firstTwoDigits = cardNumber.substring(0, 2);
  
  if (firstDigit === '4') return 'visa';
  if (['51', '52', '53', '54', '55'].includes(firstTwoDigits)) return 'mastercard';
  if (['34', '37'].includes(firstTwoDigits)) return 'amex';
  if (firstDigit === '6') return 'discover';
  
  return 'unknown';
}

module.exports = router;