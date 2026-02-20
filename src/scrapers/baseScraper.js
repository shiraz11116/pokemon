const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class BaseScraper {
  constructor(websiteName) {
    this.websiteName = websiteName;
    this.browser = null;
    this.page = null;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ];
  }

  // Initialize browser
  async initBrowser() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      this.page = await this.browser.newPage();
      
      // Set random user agent
      const randomUserAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      await this.page.setUserAgent(randomUserAgent);
      
      // Set viewport
      await this.page.setViewport({ width: 1366, height: 768 });
      
      logger.scraper(`Browser initialized for ${this.websiteName}`);
    } catch (error) {
      logger.error(`Failed to initialize browser for ${this.websiteName}:`, error);
      throw error;
    }
  }

  // Close browser
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      logger.scraper(`Browser closed for ${this.websiteName}`);
    }
  }

  // Random delay
  async randomDelay(min = 2000, max = 5000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Navigate to URL with retry
  async navigateWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        await this.randomDelay();
        return true;
      } catch (error) {
        logger.error(`Navigation attempt ${attempt} failed for ${this.websiteName}:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.randomDelay(5000, 10000);
      }
    }
  }

  // Extract price from text
  extractPrice(priceText) {
    if (!priceText) return null;
    
    const match = priceText.match(/\$?([0-9,]+\.?[0-9]*)/);;
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
  }

  // Check if item is in stock
  isInStock(availabilityText) {
    if (!availabilityText) return false;
    
    const stockKeywords = ['in stock', 'available', 'add to cart', 'buy now', 'purchase'];
    const outOfStockKeywords = ['out of stock', 'unavailable', 'sold out', 'notify me'];
    
    const text = availabilityText.toLowerCase();
    
    if (outOfStockKeywords.some(keyword => text.includes(keyword))) {
      return false;
    }
    
    if (stockKeywords.some(keyword => text.includes(keyword))) {
      return true;
    }
    
    return false;
  }

  // Handle CAPTCHA (basic implementation)
  async handleCaptcha() {
    // Check if CAPTCHA exists
    const captchaExists = await this.page.$('.captcha, #captcha, [data-captcha]') !== null;
    
    if (captchaExists) {
      logger.warn(`CAPTCHA detected on ${this.websiteName}`);
      // Wait for manual solving or implement automated solution
      await this.randomDelay(10000, 15000);
      return false;
    }
    
    return true;
  }

  // Abstract method to be implemented by child classes
  async scrapeProduct(url, selectors) {
    throw new Error('scrapeProduct method must be implemented by child class');
  }

  // Abstract method for adding to cart
  async addToCart(url, selectors) {
    throw new Error('addToCart method must be implemented by child class');
  }
}

module.exports = BaseScraper;