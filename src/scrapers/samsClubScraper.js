const BaseScraper = require('./baseScraper');
const logger = require('../utils/logger');

class SamsClubScraper extends BaseScraper {
  constructor() {
    super('SamsClub');
    this.baseUrl = 'https://www.samsclub.com';
    this.defaultSelectors = {
      price: '.Price-characteristic, [data-automation-id="product-price"], .sc-price-value',
      availability: '.sc-btn.add-to-cart-btn, [data-automation-id="add-to-cart"], .sc-btn-primary',
      addToCart: '.sc-btn.add-to-cart-btn, [data-automation-id="add-to-cart"]',
      productTitle: 'h1[data-automation-id="product-title"], .sc-product-title, h1.sc-product-name',
      productImage: 'img[data-automation-id="product-image"], .sc-product-image img',
      outOfStock: '.sc-out-of-stock, [data-automation-id="out-of-stock"], .unavailable',
      membership: '.sc-membership-required, .membership-required-msg'
    };
    
    // SamsClub specific configuration
    this.membershipRequired = true;
    this.rateLimit = 2000; // 2 seconds between requests
    this.maxRetries = 3;
  }

  async scrapeProduct(url, customSelectors = {}) {
    const selectors = { ...this.defaultSelectors, ...customSelectors };
    
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      logger.scraper(`Scraping SamsClub product: ${url}`);
      
      await this.navigateWithRetry(url);
      
      // Handle club membership requirement
      if (!(await this.handleMembershipRequirement())) {
        return { success: false, error: 'Membership required or login failed' };
      }
      
      // Handle CAPTCHA if present
      if (!(await this.handleCaptcha())) {
        return { success: false, error: 'CAPTCHA detected' };
      }

      // Wait for product content to load
      await this.page.waitForSelector(selectors.productTitle, { timeout: 15000 });
      
      // Extract product data
      const productData = await this.page.evaluate((sel) => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : null;
        };

        const getImageSrc = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.src : null;
        };

        const isElementPresent = (selector) => {
          return document.querySelector(selector) !== null;
        };

        // Extract price information
        let price = null;
        let memberPrice = null;
        
        const priceElement = document.querySelector(sel.price);
        if (priceElement) {
          const priceText = priceElement.textContent.trim();
          const priceMatch = priceText.match(/\$?(\d+\.?\d*)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
          }
        }

        // Check for member-specific pricing
        const memberPriceElement = document.querySelector('.sc-member-price, .member-price');
        if (memberPriceElement) {
          const memberPriceText = memberPriceElement.textContent.trim();
          const memberPriceMatch = memberPriceText.match(/\$?(\d+\.?\d*)/);
          if (memberPriceMatch) {
            memberPrice = parseFloat(memberPriceMatch[1]);
          }
        }

        return {
          title: getTextContent(sel.productTitle),
          price: memberPrice || price,
          originalPrice: price !== memberPrice ? price : null,
          imageUrl: getImageSrc(sel.productImage),
          availability: !isElementPresent(sel.outOfStock) && isElementPresent(sel.availability),
          membershipRequired: isElementPresent(sel.membership),
          addToCartAvailable: isElementPresent(sel.addToCart),
          scrapedAt: new Date().toISOString(),
          currency: 'USD'
        };
      }, selectors);

      // Additional SamsClub specific checks
      await this.checkBulkPricing(productData);
      await this.checkInstaPricing(productData);

      logger.scraper(`Successfully scraped SamsClub product: ${productData.title}`);
      
      return {
        success: true,
        data: productData,
        website: this.websiteName,
        url
      };

    } catch (error) {
      logger.error(`SamsClub scraping failed for ${url}:`, error);
      return {
        success: false,
        error: error.message,
        website: this.websiteName,
        url
      };
    }
  }

  async handleMembershipRequirement() {
    try {
      // Check if membership login is required
      const membershipRequired = await this.page.$('.sc-membership-wall, .membership-required');
      
      if (membershipRequired) {
        logger.scraper('SamsClub membership wall detected');
        
        // For now, we'll return false if membership is required
        // In production, this would handle actual membership login
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error handling SamsClub membership requirement:', error);
      return false;
    }
  }

  async checkBulkPricing(productData) {
    try {
      // SamsClub often has bulk pricing - check for unit pricing
      const bulkInfo = await this.page.evaluate(() => {
        const bulkElement = document.querySelector('.sc-bulk-price, .unit-price, .per-unit');
        if (bulkElement) {
          return {
            bulkPrice: bulkElement.textContent.trim(),
            hasBulkPricing: true
          };
        }
        return { hasBulkPricing: false };
      });

      if (bulkInfo.hasBulkPricing) {
        productData.bulkPrice = bulkInfo.bulkPrice;
        productData.hasBulkPricing = true;
      }
    } catch (error) {
      logger.error('Error checking bulk pricing:', error);
    }
  }

  async checkInstaPricing(productData) {
    try {
      // Check for SamsClub Instant Savings
      const instaInfo = await this.page.evaluate(() => {
        const instaElement = document.querySelector('.sc-instant-savings, .instant-savings');
        if (instaElement) {
          return {
            instantSavings: instaElement.textContent.trim(),
            hasInstantSavings: true
          };
        }
        return { hasInstantSavings: false };
      });

      if (instaInfo.hasInstantSavings) {
        productData.instantSavings = instaInfo.instantSavings;
        productData.hasInstantSavings = true;
      }
    } catch (error) {
      logger.error('Error checking instant savings:', error);
    }
  }

  // SamsClub specific search functionality
  async searchProducts(query, limit = 20) {
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      const searchUrl = `${this.baseUrl}/search?searchTerm=${encodeURIComponent(query)}`;
      
      logger.scraper(`Searching SamsClub for: ${query}`);
      
      await this.navigateWithRetry(searchUrl);
      
      // Wait for search results
      await this.page.waitForSelector('.sc-product-card, [data-automation-id="product-tile"]', { timeout: 10000 });

      const searchResults = await this.page.evaluate((maxResults) => {
        const productCards = document.querySelectorAll('.sc-product-card, [data-automation-id="product-tile"]');
        const results = [];

        for (let i = 0; i < Math.min(productCards.length, maxResults); i++) {
          const card = productCards[i];
          
          const titleElement = card.querySelector('h3, .sc-product-name, [data-automation-id="product-name"]');
          const priceElement = card.querySelector('.Price-characteristic, [data-automation-id="product-price"]');
          const linkElement = card.querySelector('a');
          const imageElement = card.querySelector('img');

          if (titleElement && linkElement) {
            results.push({
              title: titleElement.textContent.trim(),
              price: priceElement ? priceElement.textContent.trim() : 'Price not available',
              url: linkElement.href,
              imageUrl: imageElement ? imageElement.src : null
            });
          }
        }

        return results;
      }, limit);

      logger.scraper(`Found ${searchResults.length} SamsClub products for query: ${query}`);
      
      return {
        success: true,
        results: searchResults,
        website: this.websiteName,
        query
      };

    } catch (error) {
      logger.error(`SamsClub search failed for "${query}":`, error);
      return {
        success: false,
        error: error.message,
        website: this.websiteName,
        query
      };
    }
  }

  // Override rate limiting for SamsClub
  async delay(ms = this.rateLimit) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SamsClubScraper;