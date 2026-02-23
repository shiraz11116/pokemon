// Polyfill for File API compatibility (Railway Node.js fix)
if (typeof File === 'undefined') {
  global.File = class File {
    constructor(parts, filename, options = {}) {
      this.parts = parts;
      this.name = filename;
      this.type = options.type || '';
      this.lastModified = options.lastModified || Date.now();
    }
  };
}

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

// Trust proxy for Railway deployment
app.set('trust proxy', true);

// Initialize test data function
const initializeTestData = () => {
  testStorage.initializePersistentData();
  logger.info('✅ Test data initialized and loaded from files');
};

// Rate limiting with safe defaults
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Only use rate limiter in production to avoid Railway proxy issues
if (process.env.NODE_ENV === 'production') {
  app.use(limiter);
}

// Serve static files from React build
app.use(express.static('pokemon-dashboard/build'));

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

const buildPath = path.join(__dirname, 'pokemon-dashboard', 'build', 'index.html');
const buildDir = path.join(__dirname, 'pokemon-dashboard', 'build');

logger.info('🔍 Checking for React build...');
logger.info(`Build directory: ${buildDir}`);
logger.info(`Build file: ${buildPath}`);

if (fs.existsSync(buildPath)) {
  logger.info('✅ React build found! Serving React app for non-API routes.');
  logger.info(`📁 Build files: ${fs.readdirSync(buildDir).join(', ')}`);
  app.get('*', (req, res) => {
    logger.info(`📄 Serving React app for: ${req.path}`);
    res.sendFile(buildPath);
  });
} else {
  logger.error('❌ React build not found! Serving API-only mode.');
  logger.error('🔍 Available directories:');
  try {
    const dashboardDir = path.join(__dirname, 'pokemon-dashboard');
    if (fs.existsSync(dashboardDir)) {
      logger.error(`📁 pokemon-dashboard contents: ${fs.readdirSync(dashboardDir).join(', ')}`);
    } else {
      logger.error('❌ pokemon-dashboard directory not found!');
    }
  } catch (error) {
    logger.error(`Directory check error: ${error.message}`);
  }
  
  app.get('*', (req, res) => {
    res.json({ 
      message: 'Pokemon Card Auto-Purchase System API', 
      status: 'running',
      note: 'React dashboard not available - build folder missing'
    });
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

// Initialize managers and automated bot with error handling
let scraperManager, purchaseManager, automatedBot;

try {
  scraperManager = new ScraperManager();
  purchaseManager = new PurchaseManager();
  automatedBot = new AutomatedPurchaseBot();
  logger.info('✅ Managers initialized successfully');
} catch (error) {
  logger.error('❌ Manager initialization failed:', error.message);
}

// Start automated bot in test mode (Railway safe)
if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/pokemon-cards') {
  if (automatedBot) {
    setTimeout(async () => {
      try {
        // Only start bot if not in Railway production environment
        if (process.env.NODE_ENV !== 'production' || process.env.AUTO_PURCHASE_ENABLED === 'true') {
          await automatedBot.start();
          logger.info('🤖 Automated Purchase Bot is now monitoring for deals!');
          logger.info('⏰ Bot Schedule:');
          logger.info('   • Quick checks: Every 2 minutes');
          logger.info('   • Deep analysis: Every 10 minutes');
          logger.info('   • Daily summary: Every 24 hours');
        } else {
          logger.info('🤖 Bot disabled in production environment');
        }
      } catch (error) {
        logger.error('❌ Failed to start automated bot:', error.message);
        logger.info('✅ Server continues running without automated bot');
      }
    }, 10000); // Start bot 10 seconds after server startup
  }
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