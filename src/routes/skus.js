const express = require('express');
const { body, validationResult } = require('express-validator');
const SKU = require('../models/SKU');
const { authenticateToken } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;
const testStorage = require('../utils/testStorage');

const router = express.Router();

// Test mode storage for SKUs - now using testStorage
// let testSKUs = [];      // Removed - now using testStorage
// let skuIdCounter = 1;   // Removed - now using testStorage

// Helper function to check if MongoDB is connected
const isMongoConnected = () => mongoose.connection.readyState === 1;

// All routes require authentication
router.use(authenticateToken);

// Get all SKUs for user
router.get('/', catchAsync(async (req, res) => {
  const { status, priority, website } = req.query;
  
  if (isMongoConnected()) {
    // MongoDB mode
    const filter = { createdBy: req.user._id };
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (website) filter['websites.name'] = website;
    
    const skus = await SKU.find(filter).sort({ createdAt: -1 });
    
    res.json({
      status: 'success',
      results: skus.length,
      skus
    });
  } else {
    // Test mode - using testStorage
    const filteredSKUs = testStorage.findTestSKUs({ 
      createdBy: req.user._id,
      ...(status && { status }),
      ...(priority && { priority })
    });
    
    // Additional website filtering if needed
    let finalSKUs = filteredSKUs;
    if (website) {
      finalSKUs = filteredSKUs.filter(sku => 
        sku.websites && sku.websites.some(w => w.name === website)
      );
    }
    
    res.json({
      status: 'success',
      results: finalSKUs.length,
      skus: finalSKUs
    });
  }
}));

// Get single SKU
router.get('/:id', catchAsync(async (req, res) => {
  if (isMongoConnected()) {
    // MongoDB mode
    const sku = await SKU.findOne({ 
      _id: req.params.id, 
      createdBy: req.user._id 
    });
    
    if (!sku) {
      throw new AppError('SKU not found', 404);
    }
    
    res.json({
      status: 'success',
      sku
    });
  } else {
    // Test mode - using testStorage
    const sku = testStorage.findTestSKU({ _id: req.params.id });
    
    if (!sku || sku.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('SKU not found', 404);
    }
    
    res.json({
      status: 'success',
      sku
    });
  }
}));

// Create new SKU
router.post('/', [
  body('name').notEmpty().trim(),
  body('sku').notEmpty().trim(),
  body('targetPrice').isFloat({ min: 0 }),
  body('maxPrice').isFloat({ min: 0 }),
  body('websites').isArray({ min: 1 })
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  if (isMongoConnected()) {
    // MongoDB mode
    const skuData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    const sku = new SKU(skuData);
    await sku.save();
    
    logger.info(`New SKU created: ${sku.name} by ${req.user.username}`);
    
    res.status(201).json({
      status: 'success',
      sku
    });
  } else {
    // Test mode - using testStorage
    const skuData = testStorage.addTestSKU({
      ...req.body,
      createdBy: req.user._id,
      status: 'active',
      priority: req.body.priority || 'medium'
    });
    
    logger.info(`New SKU created (test mode): ${skuData.name} by ${req.user.email}`);
    
    res.status(201).json({
      status: 'success',
      sku: skuData
    });
  }
}));

// Update SKU
router.put('/:id', [
  body('name').optional().notEmpty().trim(),
  body('targetPrice').optional().isFloat({ min: 0 }),
  body('maxPrice').optional().isFloat({ min: 0 })
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  if (isMongoConnected()) {
    // MongoDB mode
    const sku = await SKU.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!sku) {
      throw new AppError('SKU not found', 404);
    }
    
    logger.info(`SKU updated: ${sku.name} by ${req.user.username}`);
    
    res.json({
      status: 'success',
      sku
    });
  } else {
    // Test mode - using testStorage
    const sku = testStorage.findTestSKU({ _id: req.params.id });
    
    if (!sku || sku.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('SKU not found', 404);
    }
    
    const updatedSKU = testStorage.updateTestSKU(req.params.id, req.body);
    
    logger.info(`SKU updated (test mode): ${updatedSKU.name} by ${req.user.email}`);
    
    res.json({
      status: 'success',
      sku: updatedSKU
    });
  }
}));

// Delete SKU
router.delete('/:id', catchAsync(async (req, res) => {
  if (isMongoConnected()) {
    // MongoDB mode
    const sku = await SKU.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });
    
    if (!sku) {
      throw new AppError('SKU not found', 404);
    }
    
    logger.info(`SKU deleted: ${sku.name} by ${req.user.username}`);
    
    res.status(204).json({
      status: 'success',
      message: 'SKU deleted successfully'
    });
  } else {
    // Test mode - using testStorage
    const sku = testStorage.findTestSKU({ _id: req.params.id });
    
    if (!sku || sku.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('SKU not found', 404);
    }
    
    const deletedSku = testStorage.deleteTestSKU(req.params.id);
    
    logger.info(`SKU deleted (test mode): ${deletedSku.name} by ${req.user.email}`);
    
    res.status(204).json({
      status: 'success',
      message: 'SKU deleted successfully'
    });
  }
}));

// Toggle SKU status
router.patch('/:id/toggle-status', catchAsync(async (req, res) => {
  if (isMongoConnected()) {
    // MongoDB mode
    const sku = await SKU.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });
    
    if (!sku) {
      throw new AppError('SKU not found', 404);
    }
    
    sku.status = sku.status === 'active' ? 'inactive' : 'active';
    await sku.save();
    
    res.json({
      status: 'success',
      sku
    });
  } else {
    // Test mode - using testStorage
    const sku = testStorage.findTestSKU({ _id: req.params.id });
    
    if (!sku || sku.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('SKU not found', 404);
    }
    
    const newStatus = sku.status === 'active' ? 'inactive' : 'active';
    const updatedSKU = testStorage.updateTestSKU(req.params.id, { status: newStatus });
    
    res.json({
      status: 'success',
      sku: updatedSKU
    });
  }
}));

module.exports = router;