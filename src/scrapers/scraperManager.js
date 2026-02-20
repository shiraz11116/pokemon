const cron = require('node-cron');
const logger = require('../utils/logger');
const emailService = require('../utils/email');

// Import scrapers
const TargetScraper = require('./targetScraper');
const BestBuyScraper = require('./bestbuyScraper');
const PokemonCenterScraper = require('./pokemonCenterScraper');
const SamsClubScraper = require('./samsClubScraper');
const CostcoScraper = require('./costcoScraper');
const WalmartScraper = require('./walmartScraper');
const GamestopScraper = require('./gamestopScraper');

// Import models
const SKU = require('../models/SKU');
const Purchase = require('../models/Purchase');
const User = require('../models/User');

class ScraperManager {
  constructor() {
    this.scrapers = {
      target: new TargetScraper(),
      bestbuy: new BestBuyScraper(),
      pokemoncenter: new PokemonCenterScraper(),
      samsclub: new SamsClubScraper(),
      costco: new CostcoScraper(),
      walmart: new WalmartScraper(),
      gamestop: new GamestopScraper()
    };
    
    this.isRunning = false;
    this.cronJobs = [];
    this.scrapingQueue = [];
    this.results = new Map();
  }

  // Start all scheduled scraping tasks
  async start() {
    if (this.isRunning) {
      logger.info('Scraper Manager is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Scraper Manager...');

    // Schedule high priority scraping every 5 minutes
    const highPriorityJob = cron.schedule('*/5 * * * *', () => {
      this.scrapeByPriority('high');
    });

    // Schedule medium priority scraping every 15 minutes
    const mediumPriorityJob = cron.schedule('*/15 * * * *', () => {
      this.scrapeByPriority('medium');
    });

    // Schedule low priority scraping every hour
    const lowPriorityJob = cron.schedule('0 * * * *', () => {
      this.scrapeByPriority('low');
    });

    // Schedule cleanup every 6 hours
    const cleanupJob = cron.schedule('0 */6 * * *', () => {
      this.cleanup();
    });

    this.cronJobs = [highPriorityJob, mediumPriorityJob, lowPriorityJob, cleanupJob];
    
    // Start initial scraping
    setTimeout(() => {
      this.scrapeByPriority('high');
    }, 5000);

    logger.info('Scraper Manager started successfully');
  }

  // Stop all scraping tasks
  async stop() {
    this.isRunning = false;
    
    // Stop all cron jobs
    this.cronJobs.forEach(job => job.destroy());
    this.cronJobs = [];
    
    // Close all scrapers
    for (const scraperName in this.scrapers) {
      try {
        await this.scrapers[scraperName].closeBrowser();
      } catch (error) {
        logger.error(`Error closing ${scraperName} scraper:`, error);
      }
    }
    
    logger.info('Scraper Manager stopped');
  }

  // Scrape SKUs by priority
  async scrapeByPriority(priority) {
    if (!this.isRunning) return;

    try {
      logger.info(`Starting ${priority} priority scraping...`);
      
      const skus = await SKU.find({
        status: 'active',
        priority: priority,
        'websites.isActive': true
      }).populate('createdBy');

      if (skus.length === 0) {
        logger.info(`No ${priority} priority SKUs found`);
        return;
      }

      const scrapePromises = [];
      
      for (const sku of skus) {
        for (const website of sku.websites) {
          if (website.isActive) {
            scrapePromises.push(
              this.scrapeSingleProduct(sku, website)
            );
          }
        }
      }

      const results = await Promise.allSettled(scrapePromises);
      
      let successCount = 0;
      let failureCount = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failureCount++;
          logger.error(`Scraping promise failed:`, result.reason);
        }
      });

      logger.info(`${priority} priority scraping completed: ${successCount} success, ${failureCount} failures`);
      
    } catch (error) {
      logger.error(`Error in ${priority} priority scraping:`, error);
    }
  }

  // Scrape a single product
  async scrapeSingleProduct(sku, website) {
    const scraperName = website.name;
    const scraper = this.scrapers[scraperName];
    
    if (!scraper) {
      logger.error(`No scraper found for website: ${scraperName}`);
      return;
    }

    try {
      const result = await scraper.scrapeProduct(website.url, website.selector);
      
      if (result.success) {
        await this.processScrapingResult(sku, website, result);
      } else {
        logger.error(`Scraping failed for ${sku.name} on ${scraperName}:`, result.error);
      }
      
      return result;
    } catch (error) {
      logger.error(`Error scraping ${sku.name} on ${scraperName}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Process scraping result and trigger actions
  async processScrapingResult(sku, website, result) {
    try {
      // Store result in cache
      const cacheKey = `${sku._id}_${website.name}`;
      this.results.set(cacheKey, {
        ...result,
        sku: sku._id,
        website: website.name,
        timestamp: new Date()
      });

      // Check if price meets target
      if (result.price && result.price <= sku.targetPrice && result.inStock) {
        logger.info(`Price alert: ${sku.name} is available for $${result.price} (target: $${sku.targetPrice})`);
        
        // Send email notification
        if (sku.createdBy) {
          await emailService.sendPriceAlert(
            sku.createdBy.email,
            sku,
            {
              currentPrice: result.price,
              website: website.name,
              inStock: result.inStock
            }
          );
        }

        // Trigger auto purchase if enabled
        if (sku.purchaseSettings.autoPurchase && !sku.purchaseSettings.requireConfirmation) {
          await this.triggerAutoPurchase(sku, website, result);
        }
      }

      // Log the result
      logger.scraper(`Scraped ${sku.name}: $${result.price} on ${website.name} (${result.inStock ? 'In Stock' : 'Out of Stock'})`);
      
    } catch (error) {
      logger.error(`Error processing scraping result:`, error);
    }
  }

  // Trigger auto purchase
  async triggerAutoPurchase(sku, website, scrapingResult) {
    try {
      logger.info(`Triggering auto purchase for ${sku.name} on ${website.name}`);
      
      // Create purchase record
      const purchase = new Purchase({
        sku: sku._id,
        website: {
          name: website.name,
          url: website.url
        },
        purchaseDetails: {
          price: scrapingResult.price,
          quantity: sku.purchaseSettings.maxQuantity,
          totalAmount: scrapingResult.price * sku.purchaseSettings.maxQuantity
        },
        createdBy: sku.createdBy
      });

      await purchase.save();
      
      // Add to purchase queue (will be processed by purchase manager)
      logger.info(`Purchase queued: ${purchase._id}`);
      
    } catch (error) {
      logger.error(`Error triggering auto purchase:`, error);
    }
  }

  // Get scraping results for a specific SKU
  getResults(skuId, websiteName = null) {
    const results = [];
    
    for (const [key, result] of this.results.entries()) {
      const [resultSkuId, resultWebsite] = key.split('_');
      
      if (resultSkuId === skuId.toString()) {
        if (!websiteName || resultWebsite === websiteName) {
          results.push(result);
        }
      }
    }
    
    return results;
  }

  // Get all recent results
  getAllResults(limit = 100) {
    const results = Array.from(this.results.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
    
    return results;
  }

  // Manual scrape trigger
  async manualScrape(skuId, websiteName = null) {
    try {
      const sku = await SKU.findById(skuId).populate('createdBy');
      if (!sku) {
        throw new Error('SKU not found');
      }

      const websites = websiteName ? 
        sku.websites.filter(w => w.name === websiteName) : 
        sku.websites.filter(w => w.isActive);

      const results = [];
      
      for (const website of websites) {
        const result = await this.scrapeSingleProduct(sku, website);
        results.push(result);
      }

      return results;
    } catch (error) {
      logger.error('Manual scrape error:', error);
      throw error;
    }
  }

  // Cleanup old results
  cleanup() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [key, result] of this.results.entries()) {
      if (new Date(result.timestamp) < oneDayAgo) {
        this.results.delete(key);
        cleanedCount++;
      }
    }
    
    logger.info(`Cleaned up ${cleanedCount} old scraping results`);
  }

  // Get manager status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeScrapers: Object.keys(this.scrapers),
      queueLength: this.scrapingQueue.length,
      resultsCount: this.results.size,
      cronJobs: this.cronJobs.length
    };
  }
}

module.exports = ScraperManager;