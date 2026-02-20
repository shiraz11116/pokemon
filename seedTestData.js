// Test data script to populate database with sample scraper results
const mongoose = require('mongoose');
const logger = require('./src/utils/logger');

// Import models
const SKU = require('./src/models/SKU');
const User = require('./src/models/User');

// Test data for different websites
const testSKUs = [
  // Target
  {
    name: 'Pokemon TCG Booster Pack - Target',
    website: 'target',
    url: 'https://www.target.com/p/pokemon-trading-card-game-booster-pack/-/A-12345',
    price: 4.99,
    availability: true,
    priority: 'high',
    tags: ['pokemon', 'tcg', 'booster'],
    isActive: true
  },
  
  // Best Buy
  {
    name: 'Pokemon Scarlet Nintendo Switch - Best Buy',
    website: 'bestbuy',
    url: 'https://www.bestbuy.com/site/pokemon-scarlet-nintendo-switch/12345.p',
    price: 59.99,
    availability: true,
    priority: 'high',
    tags: ['pokemon', 'nintendo switch', 'game'],
    isActive: true
  },
  
  // Pokemon Center
  {
    name: 'Pikachu Plush - Pokemon Center',
    website: 'pokemoncenter',
    url: 'https://www.pokemoncenter.com/product/pikachu-plush-12345',
    price: 24.99,
    availability: false,
    priority: 'medium',
    tags: ['pokemon', 'plush', 'pikachu'],
    isActive: true
  },
  
  // Walmart
  {
    name: 'Pokemon Cards Collection - Walmart',
    website: 'walmart',
    url: 'https://www.walmart.com/ip/pokemon-cards-collection/12345',
    price: 19.99,
    availability: true,
    priority: 'medium',
    tags: ['pokemon', 'cards', 'collection'],
    isActive: true
  },
  
  // GameStop
  {
    name: 'Pokemon Violet Special Edition - GameStop',
    website: 'gamestop',
    url: 'https://www.gamestop.com/product/nintendo-switch/games/pokemon-violet-special-edition/12345',
    price: 79.99,
    availability: true,
    priority: 'high',
    tags: ['pokemon', 'nintendo switch', 'special edition'],
    isActive: true
  },
  
  // Sams Club
  {
    name: 'Pokemon TCG Bundle Pack - Sams Club',
    website: 'samsclub',
    url: 'https://www.samsclub.com/p/pokemon-tcg-bundle/prod12345',
    price: 49.99,
    availability: true,
    priority: 'low',
    tags: ['pokemon', 'tcg', 'bundle'],
    isActive: true
  },
  
  // Costco
  {
    name: 'Pokemon Adventure Set - Costco',
    website: 'costco',
    url: 'https://www.costco.com/pokemon-adventure-set.product.12345.html',
    price: 89.99,
    availability: false,
    priority: 'medium',
    tags: ['pokemon', 'adventure', 'set'],
    isActive: true
  }
];

const testUsers = [
  {
    username: 'testuser1',
    email: 'test1@example.com',
    password: 'hashedpassword1',
    preferences: {
      maxPrice: 100,
      notifications: true,
      preferredWebsites: ['target', 'bestbuy', 'pokemoncenter']
    }
  },
  {
    username: 'testuser2', 
    email: 'test2@example.com',
    password: 'hashedpassword2',
    preferences: {
      maxPrice: 50,
      notifications: true,
      preferredWebsites: ['walmart', 'gamestop', 'costco']
    }
  }
];

async function populateTestData() {
  try {
    logger.info('🌱 Starting test data population...');
    
    // Clear existing test data
    await SKU.deleteMany({ name: { $regex: /test|sample/i } });
    await User.deleteMany({ email: { $regex: /@example\.com/ } });
    
    logger.info('🧹 Cleared existing test data');
    
    // Insert test SKUs
    const insertedSKUs = await SKU.insertMany(testSKUs);
    logger.info(`📦 Inserted ${insertedSKUs.length} test SKUs`);
    
    // Insert test users
    const insertedUsers = await User.insertMany(testUsers);
    logger.info(`👥 Inserted ${insertedUsers.length} test users`);
    
    // Log summary
    logger.info('✅ Test data population completed successfully!');
    logger.info(`   - SKUs: ${insertedSKUs.length} items across 7 websites`);
    logger.info(`   - Users: ${insertedUsers.length} test users`);
    logger.info(`   - Websites: Target, Best Buy, Pokemon Center, Walmart, GameStop, Sams Club, Costco`);
    
    return {
      skus: insertedSKUs,
      users: insertedUsers
    };
    
  } catch (error) {
    logger.error('❌ Error populating test data:', error);
    throw error;
  }
}

// Export for use in other files
module.exports = {
  populateTestData,
  testSKUs,
  testUsers
};

// Run directly if this file is executed
if (require.main === module) {
  const connectDB = async () => {
    try {
      if (process.env.NODE_ENV !== 'test') {
        logger.info('Running in test mode - using in-memory storage');
        return;
      }
      
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      logger.info('Connected to MongoDB');
    } catch (error) {
      logger.error('Database connection failed:', error);
      process.exit(1);
    }
  };

  connectDB()
    .then(() => populateTestData())
    .then(() => {
      logger.info('🎉 Test data setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Setup failed:', error);
      process.exit(1);
    });
}