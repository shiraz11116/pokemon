const express = require('express');
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const { authenticateToken } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const testStorage = require('../utils/testStorage');
const LiveTestingSystem = require('../utils/liveTestingSystem');

const router = express.Router();

// Initialize live testing system
const liveTestingSystem = new LiveTestingSystem();
let liveTestingInitialized = false;

// Initialize live testing system async
(async () => {
  try {
    await liveTestingSystem.initialize();
    liveTestingInitialized = true;
    logger.info('✅ Live Testing System ready for use');
  } catch (error) {
    logger.error('❌ Failed to initialize Live Testing System:', error);
  }
})();

// Check if in test mode
const isTestMode = !process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/pokemon-cards';

// Initialize some mock purchases for test mode
if (isTestMode) {
  const mockPurchases = [
    {
      _id: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(), // Will be set properly when user logs in
      website: { name: 'pokemoncenter', url: 'https://pokemoncenter.com' },
      status: 'success',
      purchaseDetails: {
        price: 29.99,
        quantity: 1,
        total: 29.99
      },
      sku: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Pokemon TCG: Scarlet & Violet Booster Pack',
        sku: 'PKM-SV-001',
        category: 'Booster Packs'
      },
      createdAt: new Date(Date.now() - 86400000), // 1 day ago
      updatedAt: new Date(Date.now() - 86400000)
    },
    {
      _id: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      website: { name: 'target', url: 'https://target.com' },
      status: 'pending',
      purchaseDetails: {
        price: 15.99,
        quantity: 2,
        total: 31.98
      },
      sku: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Pokemon Cards Battle Academy',
        sku: 'PKM-BA-002',
        category: 'Starter Sets'
      },
      createdAt: new Date(Date.now() - 3600000), // 1 hour ago
      updatedAt: new Date(Date.now() - 3600000)
    }
  ];
  testStorage.setTestPurchases(mockPurchases);
}

// Manual test purchase endpoint - for testing automated purchase system (public access for testing)
router.post('/test-purchase', catchAsync(async (req, res) => {
  // For testing - bypass auth and use first available user
  const testUser = testStorage.getTestUsers()[0];
  const req_user = testUser || { _id: '698de9652d08a3b5f0dfebb0', email: 'test@example.com' };
  
  const { skuId, websiteName } = req.body;
  
  if (mongoose.connection.readyState !== 1) {
    // Test mode - create automated purchase simulation
    const allSKUs = testStorage.findTestSKUs({ createdBy: req_user._id, isActive: true });
    const allCreditCards = testStorage.findTestCreditCards({ createdBy: req_user._id, isActive: true });
    
    if (allSKUs.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No active SKUs found. Please add Pokemon cards to monitor first.'
      });
    }
    
    if (allCreditCards.length === 0) {
      return res.status(400).json({
        status: 'error', 
        message: 'No credit cards found. Please add a credit card first.'
      });
    }
    
    // Use specified SKU or first available SKU
    const targetSKU = skuId ? 
      testStorage.findTestSKU({ _id: skuId }) : 
      allSKUs[0];
      
    if (!targetSKU) {
      return res.status(400).json({
        status: 'error',
        message: 'SKU not found'
      });
    }
    
    // Use default credit card or first available
    const creditCard = allCreditCards.find(card => card.isDefault) || allCreditCards[0];
    
    // Simulate price check and purchase decision
    const currentPrice = (Math.random() * (targetSKU.maxPrice - targetSKU.targetPrice) + targetSKU.targetPrice).toFixed(2);
    const shouldPurchase = parseFloat(currentPrice) <= targetSKU.targetPrice;
    const website = websiteName || (targetSKU.monitoredWebsites ? targetSKU.monitoredWebsites[0] : 'walmart');
    
    // Create simulated purchase
    const purchaseData = {
      createdBy: req_user._id,
      sku: {
        _id: targetSKU._id,
        name: targetSKU.name,
        sku: targetSKU.sku || targetSKU.name,
        category: targetSKU.category || 'Pokemon Cards'
      },
      website: {
        name: website,
        url: `https://www.${website}.com`
      },
      status: shouldPurchase ? 'success' : 'failed',
      purchaseDetails: {
        price: parseFloat(currentPrice),
        quantity: 1,
        total: parseFloat(currentPrice),
        creditCardUsed: creditCard.cardName,
        automatedPurchase: true,
        purchaseReason: shouldPurchase ? 
          `Price ${currentPrice} is within target range (${targetSKU.targetPrice})` :
          `Price ${currentPrice} exceeds target price (${targetSKU.targetPrice})`
      },
      metadata: {
        priceHistory: [
          { timestamp: new Date(), price: parseFloat(currentPrice), source: website }
        ],
        purchaseTrigger: 'manual_test',
        targetPrice: targetSKU.targetPrice,
        maxPrice: targetSKU.maxPrice
      }
    };
    
    const purchase = testStorage.addTestPurchase(purchaseData);
    
    logger.info(`Test purchase ${shouldPurchase ? 'completed' : 'attempted'}: ${targetSKU.name} for $${currentPrice} by ${req_user.email || req_user.username}`);
    
    res.status(201).json({
      status: 'success',
      message: shouldPurchase ? 
        `🎉 Automated purchase successful! Bot bought "${targetSKU.name}" for $${currentPrice}` :
        `⚠️ Purchase attempt failed - price $${currentPrice} exceeds target price $${targetSKU.targetPrice}`,
      purchase,
      automation: {
        triggered: true,
        priceFound: parseFloat(currentPrice),
        targetPrice: targetSKU.targetPrice,
        withinBudget: shouldPurchase,
        creditCardUsed: creditCard.cardName,
        website: website
      }
    });
    return;
  }
  
  // MongoDB mode - would implement actual purchase logic here
  res.status(500).json({
    status: 'error',
    message: 'MongoDB purchase automation not implemented in this demo'
  });
}));

// POST /purchases/live-test - Comprehensive live testing with real scraping
router.post('/live-test', async (req, res) => {
  try {
    if (!liveTestingInitialized) {
      return res.status(503).json({
        status: 'error',
        message: 'Live Testing System not initialized yet. Please try again in a few moments.'
      });
    }

    const { skuId, websiteName } = req.body;
    
    // Get user (in test mode, use default user)
    let req_user = { _id: '698de9652d08a3b5f0dfebb0', email: 'test@example.com' };
    
    // Get SKU - if not provided, use first available
    let targetSKU;
    if (skuId) {
      targetSKU = testStorage.findTestSKU({ _id: skuId });
    } else {
      const allSKUs = testStorage.getTestSKUs();
      targetSKU = allSKUs.length > 0 ? allSKUs[0] : null;
    }
    
    if (!targetSKU) {
      return res.status(400).json({
        status: 'error',
        message: 'No SKU found for testing'
      });
    }

    // Default website if not specified
    const website = websiteName || 'pokemoncenter';

    // Perform comprehensive live test
    const testResult = await liveTestingSystem.performLiveTest(
      targetSKU._id,
      website,
      req_user._id
    );

    // Return detailed test results
    res.status(200).json({
      status: 'success',
      message: testResult.success ? 
        '🎉 Live test completed successfully! All systems operational.' :
        '⚠️ Live test completed with issues. Check details below.',
      testResult,
      liveData: {
        realScraping: testResult.steps?.find(s => s.step === 'Real-time price scraping')?.data,
        cardValidation: testResult.steps?.find(s => s.step === 'Validating credit card')?.data,
        purchaseDecision: testResult.steps?.find(s => s.step === 'Purchase decision analysis')?.data,
        testPurchase: testResult.purchaseId ? `Purchase record created: ${testResult.purchaseId}` : 'No purchase created'
      }
    });

  } catch (error) {
    logger.error('Live test error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Live test failed',
      error: error.message
    });
  }
});

// GET /purchases/live-test/results - Get all live test results
router.get('/live-test/results', async (req, res) => {
  try {
    const results = liveTestingSystem.getTestResults();
    
    res.status(200).json({
      status: 'success',
      message: `Retrieved ${results.length} live test results`,
      results: results.map(result => ({
        testId: result.testId,
        success: result.success,
        duration: result.duration,
        timestamp: result.startTime,
        skuId: result.skuId,
        websiteName: result.websiteName,
        errors: result.errors,
        stepsSummary: result.steps?.map(step => ({
          step: step.step,
          status: step.status
        }))
      })),
      liveTestingStatus: {
        initialized: liveTestingInitialized,
        totalTests: results.length,
        successfulTests: results.filter(r => r.success).length,
        failedTests: results.filter(r => !r.success).length
      }
    });

  } catch (error) {
    logger.error('Error retrieving live test results:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve live test results',
      error: error.message
    });
  }
});

// All routes below require authentication
router.use(authenticateToken);

// Get all purchases for user
router.get('/', catchAsync(async (req, res) => {
  const { status, website, limit = 50, page = 1 } = req.query;
  
  if (isTestMode) {
    // Test mode - use mock data
    const filter = { createdBy: req.user._id };
    if (status) filter.status = status;
    if (website) filter['website.name'] = website;
    
    let purchases = testStorage.findTestPurchases(filter);
    
    // Set createdBy to current user for demo purposes
    purchases = purchases.map(p => ({ ...p, createdBy: req.user._id }));
    
    // Apply pagination
    const total = purchases.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    purchases = purchases.slice(startIndex, endIndex);
    
    return res.json({
      status: 'success',
      results: purchases.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      purchases
    });
  }
  
  // Real MongoDB mode
  const filter = { createdBy: req.user._id };
  
  if (status) filter.status = status;
  if (website) filter['website.name'] = website;
  
  const purchases = await Purchase.find(filter)
    .populate('sku', 'name sku category')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
  
  const total = await Purchase.countDocuments(filter);
  
  res.json({
    status: 'success',
    results: purchases.length,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit),
    purchases
  });
}));

// Get single purchase
router.get('/:id', catchAsync(async (req, res) => {
  if (isTestMode) {
    // Test mode
    const purchase = testStorage.findTestPurchaseById(req.params.id, req.user._id);
    
    if (!purchase) {
      throw new AppError('Purchase not found', 404);
    }
    
    return res.json({
      status: 'success',
      purchase: { ...purchase, createdBy: req.user._id }
    });
  }
  
  // Real MongoDB mode
  const purchase = await Purchase.findOne({ 
    _id: req.params.id, 
    createdBy: req.user._id 
  }).populate('sku');
  
  if (!purchase) {
    throw new AppError('Purchase not found', 404);
  }
  
  res.json({
    status: 'success',
    purchase
  });
}));

// Get purchase statistics
router.get('/stats/summary', catchAsync(async (req, res) => {
  const userId = req.user._id;
  
  const stats = await Purchase.aggregate([
    { $match: { createdBy: userId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$purchaseDetails.totalAmount' }
      }
    }
  ]);
  
  const websiteStats = await Purchase.aggregate([
    { $match: { createdBy: userId } },
    {
      $group: {
        _id: '$website.name',
        count: { $sum: 1 },
        totalAmount: { $sum: '$purchaseDetails.totalAmount' },
        successCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'success'] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  const recentPurchases = await Purchase.find({ createdBy: userId })
    .populate('sku', 'name')
    .sort({ createdAt: -1 })
    .limit(5);
  
  res.json({
    status: 'success',
    stats: {
      byStatus: stats,
      byWebsite: websiteStats,
      recent: recentPurchases
    }
  });
}));

// Cancel purchase
router.patch('/:id/cancel', catchAsync(async (req, res) => {
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });
  
  if (!purchase) {
    throw new AppError('Purchase not found', 404);
  }
  
  if (['success', 'cancelled'].includes(purchase.status)) {
    throw new AppError('Cannot cancel completed or already cancelled purchase', 400);
  }
  
  purchase.status = 'cancelled';
  await purchase.save();
  
  logger.info(`Purchase cancelled: ${purchase._id} by ${req.user.username}`);
  
  res.json({
    status: 'success',
    message: 'Purchase cancelled successfully',
    purchase
  });
}));

module.exports = router;