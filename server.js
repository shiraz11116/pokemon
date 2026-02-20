const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./src/routes/auth');
const skuRoutes = require('./src/routes/skus');
const purchaseRoutes = require('./src/routes/purchases');
const scraperRoutes = require('./src/routes/scrapers');
const cardRoutes = require('./src/routes/cards');

// Import middleware
const { errorHandler } = require('./src/middleware/errorHandler');
const logger = require('./src/utils/logger');
const testStorage = require('./src/utils/testStorage');

// Import managers
const ScraperManager = require('./src/scrapers/scraperManager');
const PurchaseManager = require('./src/purchaser/purchaseManager');
const AutomatedPurchaseBot = require('./src/purchaser/automatedPurchaseBot');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize test data function
const initializeTestData = () => {
  testStorage.initializePersistentData();
  logger.info('✅ Test data initialized and loaded from files');
};

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX),
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Serve static files from React build
app.use(express.static('client/build'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/skus', skuRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/scrapers', scraperRoutes);
app.use('/api/cards', cardRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve React app for any other routes (only if build exists)
const path = require('path');
const fs = require('fs');

const buildPath = path.join(__dirname, 'client', 'build', 'index.html');
if (fs.existsSync(buildPath)) {
  app.get('*', (req, res) => {
    res.sendFile(buildPath);
  });
} else {
  app.get('*', (req, res) => {
    res.json({ message: 'Pokemon Card Auto-Purchase System API', status: 'running' });
  });
}

// Error handling middleware
app.use(errorHandler);

// Connect to MongoDB (optional for testing)
if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'mongodb://localhost:27017/pokemon-cards') {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    logger.info('Connected to MongoDB');
  })
  .catch((error) => {
    logger.error('MongoDB connection error:', error);
  });
} else {
  logger.info('Running without MongoDB (test mode)');
  // Initialize persistent test data on startup
  initializeTestData();
}

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Pokemon Card Auto-Purchase System running on port ${PORT}`);
  logger.info(`📡 API Available at: http://localhost:${PORT}/api`);
  logger.info(`🏥 Health Check: http://localhost:${PORT}/api/health`);
});

// Initialize managers and automated bot
const scraperManager = new ScraperManager();
const purchaseManager = new PurchaseManager();
const automatedBot = new AutomatedPurchaseBot();

// Start automated bot in test mode
if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/pokemon-cards') {
  setTimeout(async () => {
    try {
      await automatedBot.start();
      logger.info('🤖 Automated Purchase Bot is now monitoring for deals!');
      logger.info('⏰ Bot Schedule:');
      logger.info('   • Quick checks: Every 2 minutes');
      logger.info('   • Deep analysis: Every 10 minutes');
      logger.info('   • Daily summary: Every 24 hours');
    } catch (error) {
      logger.error('Failed to start automated bot:', error);
    }
  }, 10000); // Start bot 10 seconds after server startup
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  server.close(() => {
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close();
    }
    process.exit(0);
  });
});