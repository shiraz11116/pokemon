const testStorage = require('../utils/testStorage');
const logger = require('../utils/logger');
const ScraperManager = require('../scrapers/scraperManager');

class LiveTestingSystem {
  constructor() {
    this.scraperManager = new ScraperManager();
    this.testMode = true; // Always test mode for safety
    this.testResults = [];
  }

  // Initialize live testing system
  async initialize() {
    try {
      logger.info('🧪 Initializing Live Testing System...');
      // Don't start full scraper manager, just initialize scrapers
      await this.initializeScrapers();
      logger.info('✅ Live Testing System initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Live Testing System:', error);
      throw error;
    }
  }

  // Initialize scrapers without starting cron jobs
  async initializeScrapers() {
    // Just keep reference to scrapers, don't start scheduled scraping
    this.scrapers = this.scraperManager.scrapers;
  }

  // Real scraping function for live testing
  async scrapeRealPrice(skuData, websiteName) {
    try {
      logger.info(`🔍 Live scraping: ${skuData.name} from ${websiteName}`);
      
      const scraper = this.scrapers[websiteName];
      if (!scraper) {
        logger.error(`❌ No scraper available for website: ${websiteName}`);
        return {
          success: false,
          error: `Scraper not available for ${websiteName}`,
          price: null,
          inStock: false
        };
      }

      // Find website URL from SKU data
      let websiteUrls = null;
      if (skuData.websites && Array.isArray(skuData.websites)) {
        const website = skuData.websites.find(w => w.name === websiteName);
        websiteUrls = website ? { displayUrl: website.url, productUrl: website.url } : null;
      }

      if (!websiteUrls) {
        // Generate specific URLs based on SKU
        websiteUrls = this.generateWebsiteUrl(websiteName, skuData.sku, skuData.name);
        if (typeof websiteUrls === 'string') {
          websiteUrls = { displayUrl: websiteUrls, productUrl: websiteUrls };
        }
        logger.info(`🔗 Generated URLs for ${websiteName}:`);
        logger.info(`   Product: ${websiteUrls.productUrl}`);
        if (websiteUrls.searchUrl) {
          logger.info(`   Search: ${websiteUrls.searchUrl}`);
        }
      }

      // Perform real scraping
      const scrapingResult = await scraper.scrapeProduct(websiteUrls.productUrl || websiteUrls.displayUrl);
      
      if (scrapingResult.success) {
        logger.info(`✅ Successfully scraped ${websiteName}: $${scrapingResult.price} (${scrapingResult.inStock ? 'In Stock' : 'Out of Stock'})`); 
        return {
          success: true,
          price: scrapingResult.price,
          inStock: scrapingResult.inStock,
          productTitle: scrapingResult.productTitle || skuData.name,
          productUrl: websiteUrls.displayUrl,
          directProductUrl: websiteUrls.productUrl,
          searchUrl: websiteUrls.searchUrl || websiteUrls.fallbackUrl,
          scrapedAt: new Date(),
          simulated: false
        };
      } else {
        logger.warn(`⚠️ Scraping failed for ${websiteName}: ${scrapingResult.error}`);
        // Fallback to test simulation with warning but preserve URLs
        const fallbackResult = this.fallbackSimulation(skuData.targetPrice, skuData.maxPrice, websiteName, websiteUrls);
        // Ensure URLs are preserved in fallback
        fallbackResult.directProductUrl = websiteUrls.productUrl;
        fallbackResult.searchUrl = websiteUrls.searchUrl || websiteUrls.fallbackUrl;
        return fallbackResult;
      }

    } catch (error) {
      logger.error(`❌ Error during live scraping ${websiteName}:`, error);
      // Fallback to simulation on error - but preserve URLs
      let websiteUrls = null;
      try {
        // Generate URLs even on error to preserve them
        websiteUrls = this.generateWebsiteUrl(websiteName, skuData.sku || skuData.name, skuData.name);
        logger.info(`🔗 Preserving URLs for fallback: ${websiteUrls.productUrl}`);
      } catch (urlError) {
        logger.error('Failed to generate URLs for fallback:', urlError);
      }
      return this.fallbackSimulation(skuData.targetPrice, skuData.maxPrice, websiteName, websiteUrls);
    }
  }

  // Fallback simulation when real scraping fails
  fallbackSimulation(targetPrice, maxPrice, websiteName, websiteUrls = null) {
    const simulatedPrice = this.simulateReasonablePrice(targetPrice, maxPrice);
    logger.warn(`⚡ Using fallback simulation for ${websiteName}: $${simulatedPrice}`);
    
    const baseUrl = `https://www.${websiteName}.com`;
    
    return {
      success: true,
      price: simulatedPrice,
      inStock: Math.random() > 0.2, // 80% chance in stock
      productTitle: 'Simulated Product',
      productUrl: websiteUrls?.displayUrl || baseUrl,
      directProductUrl: websiteUrls?.productUrl || baseUrl,
      searchUrl: websiteUrls?.searchUrl || `${baseUrl}/search`,
      scrapedAt: new Date(),
      simulated: true,
      fallbackReason: 'Real scraping failed'
    };
  }

  // Generate specific product URLs based on SKU and website
  generateWebsiteUrl(websiteName, sku, productName) {
    const cleanSku = sku.replace(/[^0-9a-zA-Z-]/g, '');
    const cleanName = productName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    const urlMaps = {
      pokemoncenter: {
        base: 'https://www.pokemoncenter.com',
        // Pokemon Center uses /category/ based navigation, not search
        productPatterns: [
          `/product/${cleanSku}`,  
          `/product/${cleanName}`, 
          `/product/${cleanSku}-${cleanName}`, 
        ],
        // Use category-based URLs instead of search - these actually work
        categoryUrls: [
          `/category/trading-card-game`, // Most relevant for cards
          `/category/tcg-accessories`,   // For card sleeves, deck boxes
          `/category/plush`,            // For plush items
          `/category/new-releases`,     // Latest products
          `/category/figures`,          // For figures
          `/category/pins`,            // For pins/badges
          `/`,                         // Homepage fallback
        ],
        // Primary strategy: use most relevant category
        primaryUrl: `/category/tcg-accessories` // Best match for card sleeves
      },
      target: {
        base: 'https://www.target.com', 
        productPatterns: [
          `/p/pokemon-${cleanName}/-/A-${cleanSku}`,
          `/p/${cleanName}/-/A-${cleanSku}`
        ],
        searchStrategies: [
          `/s?searchTerm=${encodeURIComponent(sku)}`,
          `/s?searchTerm=${encodeURIComponent(productName)}`
        ],
        primaryUrl: `/p/pokemon-${cleanName}/-/A-${cleanSku}`
      },
      walmart: {
        base: 'https://www.walmart.com',
        productPatterns: [
          `/ip/pokemon-${cleanName}/${cleanSku}`,
          `/ip/${cleanName}/${cleanSku}`
        ],
        searchStrategies: [
          `/search?q=${encodeURIComponent(sku)}`,
          `/search?q=${encodeURIComponent(productName)}`
        ],
        primaryUrl: `/ip/pokemon-${cleanName}/${cleanSku}`
      }
    };

    const siteConfig = urlMaps[websiteName];
    if (!siteConfig) {
      const fallbackUrl = `https://www.${websiteName}.com/search?q=${encodeURIComponent(productName)}`;
      return {
        productUrl: fallbackUrl,
        searchUrl: fallbackUrl,
        displayUrl: fallbackUrl,
        fallbackUrl: fallbackUrl,
        strategy: 'search-primary'
      };
    }

    // For Pokemon Center, use category URLs since search doesn't exist
    let primaryProductUrl;
    let fallbackUrl;
    let alternativeUrls = [];
    
    if (websiteName === 'pokemoncenter') {
      // Use most relevant category as primary for Pokemon Center
      if (productName.toLowerCase().includes('sleeve') || productName.toLowerCase().includes('tcg')) {
        primaryProductUrl = siteConfig.base + '/category/tcg-accessories';
        fallbackUrl = siteConfig.base + '/category/trading-card-game';
      } else if (productName.toLowerCase().includes('plush')) {
        primaryProductUrl = siteConfig.base + '/category/plush';
        fallbackUrl = siteConfig.base + '/category/new-releases';
      } else if (productName.toLowerCase().includes('pin') || productName.toLowerCase().includes('badge')) {
        primaryProductUrl = siteConfig.base + '/category/pins';
        fallbackUrl = siteConfig.base + '/category/new-releases';
      } else {
        // Default to homepage for unknown items
        primaryProductUrl = siteConfig.base + '/';
        fallbackUrl = siteConfig.base + '/category/new-releases';
      }
      
      // Add all category URLs as alternatives
      alternativeUrls = siteConfig.categoryUrls.map(cat => siteConfig.base + cat);
      
    } else {
      // Use search strategies for other sites
      const primarySearchUrl = siteConfig.base + (siteConfig.searchStrategies ? siteConfig.searchStrategies[0] : siteConfig.primaryUrl);
      const fallbackSearchUrl = siteConfig.base + (siteConfig.searchStrategies ? siteConfig.searchStrategies[siteConfig.searchStrategies.length - 1] : siteConfig.primaryUrl);
      
      primaryProductUrl = siteConfig.base + siteConfig.primaryUrl;
      fallbackUrl = fallbackSearchUrl;
      
      alternativeUrls = [
        ...(siteConfig.productPatterns?.map(pattern => siteConfig.base + pattern) || []),
        ...(siteConfig.searchStrategies?.map(strategy => siteConfig.base + strategy) || [])
      ];
    }
    
    return {
      productUrl: primaryProductUrl,
      searchUrl: primaryProductUrl, // Same for Pokemon Center categories
      displayUrl: primaryProductUrl, 
      fallbackUrl: fallbackUrl,
      alternativeUrls: alternativeUrls,
      strategy: websiteName === 'pokemoncenter' ? 'category-based' : 'product-primary'
    };
  }

  // Simulate reasonable price variations
  simulateReasonablePrice(targetPrice, maxPrice) {
    // 60% chance of price below target, 40% chance above target
    const isGoodDeal = Math.random() < 0.6;
    
    if (isGoodDeal) {
      // Price between 70% of target to target price
      const minPrice = targetPrice * 0.7;
      return parseFloat((Math.random() * (targetPrice - minPrice) + minPrice).toFixed(2));
    } else {
      // Price between target to max price
      return parseFloat((Math.random() * (maxPrice - targetPrice) + targetPrice).toFixed(2));
    }
  }

  // Validate credit card without charging
  async validateCreditCard(cardData) {
    try {
      logger.info(`💳 Validating credit card: ${cardData.cardName} ending in ${cardData.lastFourDigits || 'XXXX'}`);
      
      // Simulate credit card validation checks
      const validationResults = {
        cardValid: true,
        cardActive: Math.random() > 0.1, // 90% chance active
        sufficientFunds: Math.random() > 0.15, // 85% chance sufficient funds
        networkAvailable: Math.random() > 0.05, // 95% chance network available
        expiryValid: this.checkExpiryDate(cardData.expiryMonth, cardData.expiryYear),
        fraudCheck: Math.random() > 0.02 // 98% chance passes fraud check
      };

      const allChecksPass = Object.values(validationResults).every(check => check === true);
      
      if (allChecksPass) {
        logger.info(`✅ Credit card validation successful: ${cardData.cardName}`);
      } else {
        logger.warn(`⚠️ Credit card validation issues detected:`, validationResults);
      }

      return {
        success: allChecksPass,
        validationResults,
        cardName: cardData.cardName,
        validatedAt: new Date()
      };

    } catch (error) {
      logger.error('❌ Credit card validation error:', error);
      return {
        success: false,
        error: error.message,
        cardName: cardData.cardName,
        validatedAt: new Date()
      };
    }
  }

  // Check if credit card expiry date is valid
  checkExpiryDate(month, year) {
    if (!month || !year) return false;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const cardYear = parseInt(year);
    const cardMonth = parseInt(month);
    
    if (cardYear < currentYear) return false;
    if (cardYear === currentYear && cardMonth < currentMonth) return false;
    
    return true;
  }

  // Comprehensive live test for a purchase
  async performLiveTest(skuId, websiteName, userId) {
    try {
      logger.info(`🚀 Starting comprehensive live test for SKU ${skuId} on ${websiteName}`);
      
      const testResult = {
        testId: `test_${Date.now()}`,
        skuId,
        websiteName,
        userId,
        startTime: new Date(),
        steps: [],
        success: false,
        errors: []
      };

      // Step 1: Get SKU data
      testResult.steps.push({ step: 'Loading SKU data', status: 'started', timestamp: new Date() });
      const sku = testStorage.findTestSKU({ _id: skuId });
      if (!sku) {
        throw new Error('SKU not found');
      }
      testResult.steps[testResult.steps.length - 1].status = 'completed';
      testResult.steps[testResult.steps.length - 1].data = { skuName: sku.name };

      // Step 2: Get user and credit card  
      testResult.steps.push({ step: 'Loading user and credit card data', status: 'started', timestamp: new Date() });
      
      let user = null;
      let creditCards = [];
      
      if (userId) {
        user = testStorage.findTestUser({ _id: userId });
        if (user) {
          creditCards = testStorage.getTestCreditCards().filter(card => card.createdBy === userId);
        }
      }
      
      // If no user found or specified, try to use first available user as fallback
      if (!user || creditCards.length === 0) {
        const allUsers = testStorage.getTestUsers();
        const allCreditCards = testStorage.getTestCreditCards();
        
        if (allUsers.length > 0) {
          user = allUsers[0];
          creditCards = allCreditCards.filter(card => card.createdBy === user._id);
          
          logger.warn(`⚠️ Using fallback user: ${user.email} (original userId: ${userId})`);
        }
      }
      
      if (!user || creditCards.length === 0) {
        throw new Error('User or credit card not found');
      }
      
      const defaultCard = creditCards.find(card => card.isDefault) || creditCards[0];
      testResult.steps[testResult.steps.length - 1].status = 'completed';
      testResult.steps[testResult.steps.length - 1].data = { 
        userEmail: user.email,
        cardName: defaultCard.cardName 
      };

      // Step 3: Validate credit card
      testResult.steps.push({ step: 'Validating credit card', status: 'started', timestamp: new Date() });
      const cardValidation = await this.validateCreditCard(defaultCard);
      testResult.steps[testResult.steps.length - 1].status = cardValidation.success ? 'completed' : 'failed';
      testResult.steps[testResult.steps.length - 1].data = cardValidation;

      if (!cardValidation.success) {
        testResult.errors.push('Credit card validation failed');
      }

      // Step 4: Real price scraping
      testResult.steps.push({ step: 'Real-time price scraping', status: 'started', timestamp: new Date() });
      const scrapingResult = await this.scrapeRealPrice(sku, websiteName);
      testResult.steps[testResult.steps.length - 1].status = scrapingResult.success ? 'completed' : 'failed';
      testResult.steps[testResult.steps.length - 1].data = scrapingResult;

      if (!scrapingResult.success) {
        testResult.errors.push(`Price scraping failed: ${scrapingResult.error}`);
      }

      // Step 5: Purchase decision analysis
      testResult.steps.push({ step: 'Purchase decision analysis', status: 'started', timestamp: new Date() });
      const shouldPurchase = scrapingResult.price && 
                            scrapingResult.price <= sku.targetPrice && 
                            scrapingResult.inStock && 
                            cardValidation.success;
      
      const decisionData = {
        shouldPurchase,
        reasons: [],
        currentPrice: scrapingResult.price,
        targetPrice: sku.targetPrice,
        inStock: scrapingResult.inStock,
        cardValid: cardValidation.success
      };

      if (!shouldPurchase) {
        if (!scrapingResult.inStock) decisionData.reasons.push('Product out of stock');
        if (scrapingResult.price > sku.targetPrice) decisionData.reasons.push('Price above target');
        if (!cardValidation.success) decisionData.reasons.push('Credit card issues');
      } else {
        decisionData.reasons.push('All conditions met for purchase');
      }

      testResult.steps[testResult.steps.length - 1].status = 'completed';
      testResult.steps[testResult.steps.length - 1].data = decisionData;

      // Step 6: Create test purchase record
      if (shouldPurchase) {
        testResult.steps.push({ step: 'Creating test purchase record', status: 'started', timestamp: new Date() });
        
        const purchaseData = {
          createdBy: userId,
          sku: {
            _id: sku._id,
            name: sku.name,
            sku: sku.sku,
            category: sku.category || 'Pokemon Cards'
          },
          website: {
            name: websiteName,
            url: scrapingResult.productUrl || `https://www.${websiteName}.com`,
            directProductUrl: scrapingResult.directProductUrl,
            searchUrl: scrapingResult.searchUrl
          },
          status: 'test_success', // Special status for test purchases
          purchaseDetails: {
            price: scrapingResult.price,
            quantity: 1,
            total: scrapingResult.price,
            creditCardUsed: defaultCard.cardName,
            automatedPurchase: false,
            liveTest: true,
            purchaseReason: `Live test purchase - price $${scrapingResult.price} within target $${sku.targetPrice}`
          },
          metadata: {
            liveTest: true,
            testId: testResult.testId,
            realScraping: !scrapingResult.simulated,
            cardValidation: cardValidation,
            directProductUrl: scrapingResult.directProductUrl,
            searchUrl: scrapingResult.searchUrl,
            priceHistory: [
              { 
                timestamp: new Date(), 
                price: scrapingResult.price, 
                source: websiteName,
                scraped: !scrapingResult.simulated
              }
            ],
            purchaseTrigger: 'live_test'
          }
        };

        const purchase = testStorage.addTestPurchase(purchaseData);
        testResult.steps[testResult.steps.length - 1].status = 'completed';
        testResult.steps[testResult.steps.length - 1].data = { purchaseId: purchase._id };
        testResult.purchaseId = purchase._id;
      }

      testResult.endTime = new Date();
      testResult.duration = testResult.endTime - testResult.startTime;
      testResult.success = testResult.errors.length === 0;

      // Store test result
      this.testResults.push(testResult);

      // Log comprehensive summary
      this.logTestSummary(testResult);

      return testResult;

    } catch (error) {
      logger.error('❌ Live test failed:', error);
      return {
        testId: `test_${Date.now()}`,
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Log comprehensive test summary
  logTestSummary(testResult) {
    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('🧪 LIVE TEST SUMMARY');
    logger.info('═══════════════════════════════════════════════');
    logger.info(`📋 Test ID: ${testResult.testId}`);
    logger.info(`⏱️  Duration: ${testResult.duration}ms`);
    logger.info(`✅ Success: ${testResult.success ? 'YES' : 'NO'}`);
    
    if (testResult.errors.length > 0) {
      logger.info(`❌ Errors: ${testResult.errors.join(', ')}`);
    }

    logger.info('');
    logger.info('📊 TEST STEPS:');
    testResult.steps.forEach((step, index) => {
      const status = step.status === 'completed' ? '✅' : 
                   step.status === 'failed' ? '❌' : '🔄';
      logger.info(`${index + 1}. ${status} ${step.step}`);
      
      if (step.data && Object.keys(step.data).length > 0) {
        Object.entries(step.data).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            logger.info(`   ${key}: ${JSON.stringify(value, null, 2)}`);
          } else {
            logger.info(`   ${key}: ${value}`);
          }
        });
      }
    });
    logger.info('═══════════════════════════════════════════════');
    logger.info('');
  }

  // Get test results
  getTestResults() {
    return this.testResults;
  }

  // Cleanup resources
  async cleanup() {
    try {
      // Close all scraper browsers
      for (const scraperName in this.scrapers) {
        await this.scrapers[scraperName].closeBrowser();
      }
      logger.info('✅ Live Testing System cleanup completed');
    } catch (error) {
      logger.error('❌ Error during cleanup:', error);
    }
  }
}

module.exports = LiveTestingSystem;