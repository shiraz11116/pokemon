const cron = require('node-cron');
const logger = require('../utils/logger');
const testStorage = require('../utils/testStorage');
const LiveTestingSystem = require('../utils/liveTestingSystem');

class AutomatedPurchaseBot {
  constructor() {
    this.isRunning = false;
    this.cronJobs = [];
    this.purchaseAttempts = new Map();
    this.liveTestingSystem = new LiveTestingSystem();
    this.realScrapingEnabled = false;
  }

  // Initialize real scraping capability
  async initializeRealScraping() {
    try {
      await this.liveTestingSystem.initialize();
      this.realScrapingEnabled = true;
      logger.info('✅ Real scraping enabled for automated bot');
    } catch (error) {
      logger.warn('⚠️ Real scraping initialization failed, using simulation fallback:', error);
      this.realScrapingEnabled = false;
    }
  }

  // Start automated purchase bot
  async start() {
    if (this.isRunning) {
      logger.info('🤖 Automated Purchase Bot is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🤖 Starting Automated Purchase Bot...');
    
    // Initialize real scraping capability
    await this.initializeRealScraping();

    // Check for purchase opportunities every 2 minutes
    const quickCheckJob = cron.schedule('*/2 * * * *', () => {
      this.checkForPurchaseOpportunities('quick');
    });

    // Deep price analysis every 10 minutes
    const deepCheckJob = cron.schedule('*/10 * * * *', () => {
      this.checkForPurchaseOpportunities('deep');
    });

    // Daily summary and cleanup
    const dailyJob = cron.schedule('0 0 * * *', () => {
      this.dailySummary();
    });

    this.cronJobs = [quickCheckJob, deepCheckJob, dailyJob];
    
    // Initial check after 30 seconds
    setTimeout(() => {
      this.checkForPurchaseOpportunities('startup');
    }, 30000);

    logger.info('🚀 Automated Purchase Bot started successfully');
  }

  // Check for purchase opportunities
  async checkForPurchaseOpportunities(checkType) {
    if (!this.isRunning) return;

    try {
      logger.info(`🔍 Running ${checkType} purchase opportunity check...`);
      
      // Get all active users and their SKUs
      const users = testStorage.getTestUsers();
      
      for (const user of users) {
        const userSKUs = testStorage.findTestSKUs({ 
          createdBy: user._id, 
          isActive: true 
        });
        
        const userCreditCards = testStorage.findTestCreditCards({ 
          createdBy: user._id, 
          isActive: true 
        });

        if (userSKUs.length === 0 || userCreditCards.length === 0) {
          continue;
        }

        // Check each SKU for purchase opportunities
        for (const sku of userSKUs) {
          await this.checkSKUForPurchase(user, sku, userCreditCards, checkType);
        }
      }

    } catch (error) {
      logger.error('Error in automated purchase check:', error);
    }
  }

  // Check individual SKU for purchase opportunity
  async checkSKUForPurchase(user, sku, creditCards, checkType) {
    try {
      // Check prices from multiple websites
      const websites = sku.monitoredWebsites || ['walmart', 'target', 'pokemoncenter'];
      
      for (const website of websites) {
        // Get current market price (real scraping or simulation)
        const marketData = await this.getMarketPrice(sku, website);
        const marketPrice = marketData.price;
        
        // Check if price is within target range AND product is in stock
        if (marketPrice <= sku.targetPrice && marketData.inStock) {
          const attemptKey = `${sku._id}-${website}`;
          const lastAttempt = this.purchaseAttempts.get(attemptKey);
          
          // Avoid duplicate purchases (cooldown period)
          if (lastAttempt && (Date.now() - lastAttempt) < 300000) { // 5 min cooldown
            continue;
          }
          
          // Execute automated purchase
          const success = await this.executeAutomatedPurchase(user, sku, creditCards, website, marketPrice, checkType, marketData);
          
          if (success) {
            this.purchaseAttempts.set(attemptKey, Date.now());
            const scrapingType = marketData.realData ? 'scraped' : 'simulated';
            logger.info(`✅ Automated purchase successful for ${user.email}: ${sku.name} at $${marketPrice} (${scrapingType} data)`);
          }
        } else {
          // Log why purchase was not made
          const reasons = [];
          if (marketPrice > sku.targetPrice) reasons.push(`price $${marketPrice} > target $${sku.targetPrice}`);
          if (!marketData.inStock) reasons.push('out of stock');
          
          logger.debug(`❌ Purchase skipped for ${sku.name} on ${website}: ${reasons.join(', ')}`);
        }
      }

    } catch (error) {
      logger.error(`Error checking SKU ${sku.name}:`, error);
    }
  }

  // Execute automated purchase
  async executeAutomatedPurchase(user, sku, creditCards, website, price, checkType, marketData = null) {
    try {
      const defaultCard = creditCards.find(card => card.isDefault) || creditCards[0];
      
      // Determine purchase reason based on data source
      const dataSource = marketData?.realData ? 'scraped' : 'simulated';
      const stockInfo = marketData?.inStock !== undefined ? ` (${marketData.inStock ? 'in stock' : 'limited stock'})` : '';
      
      // Generate specific website URLs using liveTestingSystem
      const liveTestingSys = new LiveTestingSystem();
      const urlData = liveTestingSys.generateWebsiteUrl(website, sku.sku || sku.name, sku.name);
      
      let websiteUrl;
      let directProductUrl = null;
      let searchUrl = null;
      
      if (typeof urlData === 'object' && urlData.productUrl) {
        websiteUrl = urlData.displayUrl || urlData.productUrl;
        directProductUrl = urlData.productUrl;
        searchUrl = urlData.searchUrl;
      } else if (typeof urlData === 'string') {
        websiteUrl = urlData;
      } else {
        websiteUrl = `https://www.${website}.com`;
      }
      
      // Create automated purchase record
      const purchaseData = {
        createdBy: user._id,
        sku: {
          _id: sku._id,
          name: sku.name,
          sku: sku.sku || sku.name,
          category: sku.category || 'Pokemon Cards'
        },
        website: {
          name: website,
          url: websiteUrl,
          directProductUrl: directProductUrl,
          searchUrl: searchUrl
        },
        status: 'success',
        purchaseDetails: {
          price: price,
          quantity: 1,
          total: price,
          creditCardUsed: defaultCard.cardName,
          automatedPurchase: true,
          purchaseReason: `Automated bot purchase - ${dataSource} price $${price} within target $${sku.targetPrice}${stockInfo}`,
          checkType: checkType
        },
        metadata: {
          priceHistory: [
            { 
              timestamp: new Date(), 
              price: price, 
              source: website,
              dataSource: dataSource,
              realScraping: marketData?.realData || false,
              inStock: marketData?.inStock || true
            }
          ],
          purchaseTrigger: 'automated_bot',
          targetPrice: sku.targetPrice,
          maxPrice: sku.maxPrice,
          botVersion: '1.0',
          executionTime: new Date(),
          directProductUrl: directProductUrl,
          searchUrl: searchUrl,
          realScraping: marketData?.realData || false
        }
      };

      const purchase = testStorage.addTestPurchase(purchaseData);
      
      // Log the automated purchase
      logger.info(`🤖 AUTOMATED PURCHASE EXECUTED: ${sku.name} for $${price} from ${website} for ${user.email}`);
      
      return purchase;

    } catch (error) {
      logger.error('Error executing automated purchase:', error);
      return false;
    }
  }

  // Get market price - real scraping or simulation
  async getMarketPrice(sku, website) {
    if (this.realScrapingEnabled) {
      try {
        logger.info(`🔍 Attempting real scraping for ${sku.name} on ${website}`);
        const scrapingResult = await this.liveTestingSystem.scrapeRealPrice(sku, website);
        
        if (scrapingResult.success && scrapingResult.price) {
          logger.info(`✅ Real price scraped: $${scrapingResult.price} from ${website} (${scrapingResult.inStock ? 'In Stock' : 'Out of Stock'})`);
          return {
            price: scrapingResult.price,
            inStock: scrapingResult.inStock,
            realData: true,
            source: website,
            scrapedAt: new Date()
          };
        } else {
          logger.warn(`⚠️ Real scraping failed for ${website}, falling back to simulation`);
          return this.simulateMarketData(sku.targetPrice, sku.maxPrice, website);
        }
      } catch (error) {
        logger.warn(`⚠️ Error during real scraping for ${website}, using simulation:`, error);
        return this.simulateMarketData(sku.targetPrice, sku.maxPrice, website);
      }
    } else {
      return this.simulateMarketData(sku.targetPrice, sku.maxPrice, website);
    }
  }

  // Simulate market data (fallback)
  simulateMarketData(targetPrice, maxPrice, website) {
    const price = this.simulateMarketPrice(targetPrice, maxPrice);
    const inStock = Math.random() > 0.2; // 80% chance in stock
    
    logger.info(`🎲 Simulated price: $${price} from ${website} (${inStock ? 'In Stock' : 'Out of Stock'})`);
    
    return {
      price: price,
      inStock: inStock,
      realData: false,
      source: website,
      scrapedAt: new Date(),
      simulated: true
    };
  }

  // Simulate market price fluctuations
  simulateMarketPrice(targetPrice, maxPrice) {
    // 70% chance of good deal, 30% chance of high price
    const isGoodDeal = Math.random() < 0.7;
    
    if (isGoodDeal) {
      // Price between 80% of target to target price
      return parseFloat((Math.random() * (targetPrice - targetPrice * 0.8) + targetPrice * 0.8).toFixed(2));
    } else {
      // Price between target to max price  
      return parseFloat((Math.random() * (maxPrice - targetPrice) + targetPrice).toFixed(2));
    }
  }

  // Daily summary
  async dailySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const purchases = testStorage.getTestPurchases().filter(p => 
      new Date(p.createdAt) >= today && 
      p.purchaseDetails && 
      p.purchaseDetails.automatedPurchase
    );

    logger.info(`📊 Daily Bot Summary: ${purchases.length} automated purchases made today`);
  }

  // Stop automated bot
  async stop() {
    this.isRunning = false;
    
    this.cronJobs.forEach(job => job.destroy());
    this.cronJobs = [];
    
    logger.info('🤖 Automated Purchase Bot stopped');
  }
}

module.exports = AutomatedPurchaseBot;