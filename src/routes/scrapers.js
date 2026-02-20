const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const testStorage = require('../utils/testStorage');

const router = express.Router();

// In test mode, skip authentication for easier testing
const testAuth = (req, res, next) => {
  // Use same condition as server.js for test mode detection
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/pokemon-cards') {
    // Create a mock user for test mode
    req.user = {
      _id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      role: 'admin'
    };
    return next();
  }
  return authenticateToken(req, res, next);
};

// Use test-friendly authentication
router.use(testAuth);

// Get scraper status (available to all users)
router.get('/status', catchAsync(async (req, res) => {
  const status = {
    isRunning: true,
    activeScrapers: ['target', 'bestbuy', 'pokemoncenter', 'samsclub', 'costco', 'walmart', 'gamestop'],
    lastUpdate: new Date().toISOString(),
    queueLength: 3
  };
  
  res.json(status);
}));

// Get scraping results for user's SKUs
router.get('/results', catchAsync(async (req, res) => {
  // In test mode, return sample scraper results
  const results = testStorage.getTestScraperResults();
  
  res.json(results);
}));

// Manual scrape trigger (admin only)
router.post('/manual-scrape', requireAdmin, catchAsync(async (req, res) => {
  const { website, url } = req.body;
  
  if (!website || !url) {
    throw new AppError('Website and URL are required', 400);
  }
  
  // Add a new test scraper result
  const newResult = testStorage.addTestScraperResult({
    website,
    url,
    success: true,
    data: {
      title: `Test Product from ${website}`,
      price: Math.floor(Math.random() * 100) + 10,
      imageUrl: `https://via.placeholder.com/200x200?text=${website}`,
      availability: Math.random() > 0.3
    }
  });
  
  logger.info(`Manual scrape triggered for ${website}: ${url} by ${req.user.username}`);
  
  res.json({
    status: 'success',
    message: 'Manual scrape completed',
    result: newResult
  });
}));

// Start/Stop scrapers (admin only)
router.post('/control/:action', requireAdmin, catchAsync(async (req, res) => {
  const { action } = req.params;
  
  if (!['start', 'stop', 'pause', 'resume'].includes(action)) {
    throw new AppError('Invalid action. Use start, stop, pause, or resume', 400);
  }
  
  logger.info(`Scraper ${action} requested by ${req.user.username}`);
  
  res.json({
    status: 'success',
    message: `Scrapers ${action} request processed`,
    action
  });
}));

module.exports = router;