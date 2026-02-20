// Test mode storage - shared between auth routes and middleware
const { ObjectId } = require('mongoose').Types;
const fs = require('fs');
const path = require('path');

// File paths for persistent storage
const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'testUsers.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'testPurchases.json');
const SCRAPER_RESULTS_FILE = path.join(DATA_DIR, 'testScraperResults.json');
const SKUS_FILE = path.join(DATA_DIR, 'testSKUs.json');
const CREDIT_CARDS_FILE = path.join(DATA_DIR, 'testCreditCards.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let testUsers = [];
let testPurchases = [];
let testScraperResults = [];
let testSKUs = [];
let testCreditCards = [];
let userIdCounter = 1;
let purchaseIdCounter = 1;

// Sample scraper results for testing
const sampleScraperResults = [
  {
    id: '1',
    website: 'target',
    url: 'https://www.target.com/p/pokemon-tcg-booster-pack/-/A-12345',
    success: true,
    data: {
      title: 'Pokemon TCG Booster Pack - Scarlet & Violet',
      price: 4.99,
      imageUrl: 'https://target.scene7.com/is/image/Target/GUEST_12345',
      availability: true
    },
    timestamp: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
  },
  {
    id: '2',
    website: 'walmart',
    url: 'https://www.walmart.com/ip/pokemon-cards-collection/12345',
    success: true,
    data: {
      title: 'Pokemon Trading Cards Premium Collection',
      price: 19.99,
      imageUrl: 'https://i5.walmartimages.com/asr/12345.jpeg',
      availability: true
    },
    timestamp: new Date(Date.now() - 600000).toISOString() // 10 minutes ago
  },
  {
    id: '3',
    website: 'gamestop',
    url: 'https://www.gamestop.com/product/nintendo-switch/games/pokemon-violet-special-edition/12345',
    success: true,
    data: {
      title: 'Pokemon Violet Special Edition - Nintendo Switch',
      price: 79.99,
      imageUrl: 'https://media.gamestop.com/i/gamestop/12345.jpg',
      availability: false
    },
    timestamp: new Date(Date.now() - 900000).toISOString() // 15 minutes ago
  },
  {
    id: '4',
    website: 'bestbuy',
    url: 'https://www.bestbuy.com/site/pokemon-scarlet-nintendo-switch/12345.p',
    success: true,
    data: {
      title: 'Pokemon Scarlet - Nintendo Switch',
      price: 59.99,
      imageUrl: 'https://pisces.bbystatic.com/image2/BestBuy_US/images/products/12345.jpg',
      availability: true
    },
    timestamp: new Date(Date.now() - 1200000).toISOString() // 20 minutes ago
  },
  {
    id: '5',
    website: 'pokemoncenter',
    url: 'https://www.pokemoncenter.com/product/pikachu-plush-12345',
    success: false,
    data: null,
    error: 'Product page not found',
    timestamp: new Date(Date.now() - 1500000).toISOString() // 25 minutes ago
  },
  {
    id: '6',
    website: 'costco',
    url: 'https://www.costco.com/pokemon-adventure-set.product.12345.html',
    success: true,
    data: {
      title: 'Pokemon Adventure Playset with Figures',
      price: 89.99,
      imageUrl: 'https://images.costco-static.com/ImageDelivery/12345.jpg',
      availability: true
    },
    timestamp: new Date(Date.now() - 1800000).toISOString() // 30 minutes ago
  },
  {
    id: '7',
    website: 'samsclub',
    url: 'https://www.samsclub.com/p/pokemon-tcg-bundle/prod12345',
    success: true,
    data: {
      title: 'Pokemon TCG Bundle Pack - 36 Boosters',
      price: 49.99,
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/12345',
      availability: false
    },
    timestamp: new Date(Date.now() - 2100000).toISOString() // 35 minutes ago
  }
];

// Initialize test scraper results
testScraperResults = [...sampleScraperResults];

// Helper functions for file operations
const loadFromFile = (filePath, defaultData = []) => {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(data) ? data : defaultData;
    }
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
  }
  return defaultData;
};

const saveToFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
  }
};

// Load existing data on startup
const loadPersistentData = () => {
  testUsers = loadFromFile(USERS_FILE, []);
  testPurchases = loadFromFile(PURCHASES_FILE, []);
  testSKUs = loadFromFile(SKUS_FILE, []);
  testCreditCards = loadFromFile(CREDIT_CARDS_FILE, []);
  const savedResults = loadFromFile(SCRAPER_RESULTS_FILE, []);
  
  // Merge saved results with sample data, keeping saved ones first
  testScraperResults = [...savedResults, ...sampleScraperResults.filter(sample => 
    !savedResults.some(saved => saved.id === sample.id)
  )];
  
  // Set counters based on existing data
  if (testUsers.length > 0) {
    userIdCounter = Math.max(...testUsers.map(u => parseInt(u.id) || 0)) + 1;
  }
  if (testPurchases.length > 0) {
    purchaseIdCounter = Math.max(...testPurchases.map(p => parseInt(p.id) || 0)) + 1;
  }
  
  // Log loaded data for verification
  console.log(`📂 Loaded ${testUsers.length} users from persistent storage`);
  console.log(`📂 Loaded ${testSKUs.length} SKUs from persistent storage`);
  console.log(`📂 Loaded ${testPurchases.length} purchases from persistent storage`);
  console.log(`📂 Loaded ${testCreditCards.length} credit cards from persistent storage`);
  console.log(`📂 Loaded ${testScraperResults.length} scraper results from persistent storage`);
};

module.exports = {
  getTestUsers: () => testUsers,
  setTestUsers: (users) => { 
    testUsers = users; 
    saveToFile(USERS_FILE, users);
  },
  addTestUser: (user) => { 
    user._id = new ObjectId(); // Use proper MongoDB ObjectId
    testUsers.push(user);
    saveToFile(USERS_FILE, testUsers);
    return user;
  },
  
  // Purchases methods
  getTestPurchases: () => testPurchases,
  setTestPurchases: (purchases) => { 
    testPurchases = purchases; 
    saveToFile(PURCHASES_FILE, purchases);
  },
  addTestPurchase: (purchase) => {
    purchase._id = new ObjectId();
    purchase.createdAt = new Date();
    purchase.updatedAt = new Date();
    testPurchases.push(purchase);
    saveToFile(PURCHASES_FILE, testPurchases);
    return purchase;
  },
  findTestPurchases: (query = {}) => {
    let filtered = testPurchases;
    
    if (query.createdBy) {
      filtered = filtered.filter(p => p.createdBy.toString() === query.createdBy.toString());
    }
    if (query.status) {
      filtered = filtered.filter(p => p.status === query.status);
    }
    if (query['website.name']) {
      filtered = filtered.filter(p => p.website && p.website.name === query['website.name']);
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  findTestPurchaseById: (id, userId) => {
    return testPurchases.find(p => 
      p._id.toString() === id.toString() && 
      p.createdBy.toString() === userId.toString()
    );
  },
  
  findTestUser: (query) => {
    if (query._id) {
      return testUsers.find(u => u._id.toString() === query._id.toString());
    }
    if (query.email) {
      return testUsers.find(u => u.email === query.email);
    }
    if (query.username) {
      return testUsers.find(u => u.username === query.username);
    }
    return null;
  },
  
  // Scraper results methods
  getTestScraperResults: () => testScraperResults,
  setTestScraperResults: (results) => { 
    testScraperResults = results; 
    saveToFile(SCRAPER_RESULTS_FILE, results);
  },
  addTestScraperResult: (result) => {
    result.id = result.id || String(Date.now());
    result.timestamp = result.timestamp || new Date().toISOString();
    testScraperResults.unshift(result); // Add to beginning for newest first
    
    // Keep only last 50 results to prevent memory issues
    if (testScraperResults.length > 50) {
      testScraperResults = testScraperResults.slice(0, 50);
    }
    
    saveToFile(SCRAPER_RESULTS_FILE, testScraperResults);
    return result;
  },
  
  // Initialize function
  initializePersistentData: () => {
    loadPersistentData();
  },
  
  // SKU methods
  getTestSKUs: () => testSKUs,
  setTestSKUs: (skus) => { 
    testSKUs = skus; 
    saveToFile(SKUS_FILE, skus);
  },
  addTestSKU: (sku) => {
    sku._id = new ObjectId();
    sku.createdAt = new Date();
    sku.updatedAt = new Date();
    testSKUs.push(sku);
    saveToFile(SKUS_FILE, testSKUs);
    return sku;
  },
  findTestSKU: (query) => {
    if (query._id) {
      return testSKUs.find(s => s._id.toString() === query._id.toString());
    }
    if (query.sku) {
      return testSKUs.find(s => s.sku === query.sku);
    }
    return null;
  },
  findTestSKUs: (query = {}) => {
    let filtered = testSKUs;
    
    if (query.createdBy) {
      filtered = filtered.filter(s => s.createdBy.toString() === query.createdBy.toString());
    }
    if (query.isActive !== undefined) {
      filtered = filtered.filter(s => s.isActive === query.isActive);
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  updateTestSKU: (id, updateData) => {
    const skuIndex = testSKUs.findIndex(s => s._id.toString() === id.toString());
    if (skuIndex !== -1) {
      testSKUs[skuIndex] = { ...testSKUs[skuIndex], ...updateData, updatedAt: new Date() };
      saveToFile(SKUS_FILE, testSKUs);
      return testSKUs[skuIndex];
    }
    return null;
  },
  deleteTestSKU: (id) => {
    const skuIndex = testSKUs.findIndex(s => s._id.toString() === id.toString());
    if (skuIndex !== -1) {
      const deletedSKU = testSKUs.splice(skuIndex, 1)[0];
      saveToFile(SKUS_FILE, testSKUs);
      return deletedSKU;
    }
    return null;
  },
  
  getUserIdCounter: () => userIdCounter,
  incrementCounter: () => ++userIdCounter,
  getPurchaseIdCounter: () => purchaseIdCounter,
  incrementPurchaseCounter: () => ++purchaseIdCounter,
  
  // Credit Cards methods
  getTestCreditCards: () => testCreditCards,
  setTestCreditCards: (cards) => { 
    testCreditCards = cards; 
    saveToFile(CREDIT_CARDS_FILE, cards);
  },
  addTestCreditCard: (card) => {
    card._id = new ObjectId();
    card.createdAt = new Date();
    card.updatedAt = new Date();
    testCreditCards.push(card);
    saveToFile(CREDIT_CARDS_FILE, testCreditCards);
    return card;
  },
  findTestCreditCard: (query) => {
    if (query._id) {
      return testCreditCards.find(c => c._id.toString() === query._id.toString());
    }
    if (query.cardName) {
      return testCreditCards.find(c => c.cardName === query.cardName);
    }
    return null;
  },
  findTestCreditCards: (query = {}) => {
    let filtered = testCreditCards;
    
    if (query.createdBy) {
      filtered = filtered.filter(c => c.createdBy.toString() === query.createdBy.toString());
    }
    if (query.isActive !== undefined) {
      filtered = filtered.filter(c => c.isActive === query.isActive);
    }
    if (query.isDefault !== undefined) {
      filtered = filtered.filter(c => c.isDefault === query.isDefault);
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  updateTestCreditCard: (id, updateData) => {
    const cardIndex = testCreditCards.findIndex(c => c._id.toString() === id.toString());
    if (cardIndex !== -1) {
      testCreditCards[cardIndex] = { ...testCreditCards[cardIndex], ...updateData, updatedAt: new Date() };
      saveToFile(CREDIT_CARDS_FILE, testCreditCards);
      return testCreditCards[cardIndex];
    }
    return null;
  },
  deleteTestCreditCard: (id) => {
    const cardIndex = testCreditCards.findIndex(c => c._id.toString() === id.toString());
    if (cardIndex !== -1) {
      const deletedCard = testCreditCards.splice(cardIndex, 1)[0];
      saveToFile(CREDIT_CARDS_FILE, testCreditCards);
      return deletedCard;
    }
    return null;
  }
};

// Load data immediately when module is imported
loadPersistentData();