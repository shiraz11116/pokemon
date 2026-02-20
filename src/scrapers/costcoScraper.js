const BaseScraper = require('./baseScraper');
const logger = require('../utils/logger');

class CostcoScraper extends BaseScraper {
  constructor() {
    super('Costco');
    this.baseUrl = 'https://www.costco.com';
    this.defaultSelectors = {
      price: '.sr-only .currency, .price-current, .price .sr-only, .price-range .sr-only',
      availability: '.add-to-cart-btn, [data-automation-id="addToCartButton"], .btn-add-to-cart',
      addToCart: '.add-to-cart-btn, [data-automation-id="addToCartButton"]',
      productTitle: 'h1[automation-id="productName"], .product-h1, h1.product-title',
      productImage: 'img[automation-id="productImageMain"], .product-image-main img, .carousel-main img',
      outOfStock: '.out-of-stock, .unavailable, [data-automation-id="outOfStock"]',
      membership: '.membership-required, .sign-in-required, .member-only',
      captcha: '.captcha, .challenge, #challenge-form'
    };
    
    // Costco specific configuration
    this.membershipRequired = true;
    this.rateLimit = 3000; // 3 seconds between requests (Costco is strict)
    this.maxRetries = 2;
    this.requiresCaptchaHandling = true;
  }

  async scrapeProduct(url, customSelectors = {}) {
    const selectors = { ...this.defaultSelectors, ...customSelectors };
    
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      logger.scraper(`Scraping Costco product: ${url}`);
      
      // Extra headers for Costco
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      });
      
      await this.navigateWithRetry(url);
      
      // Handle CAPTCHA first (Costco uses aggressive bot protection)
      if (!(await this.handleCostcoCaptcha())) {
        return { success: false, error: 'CAPTCHA or bot protection detected' };
      }
      
      // Handle membership requirement
      if (!(await this.handleMembershipRequirement())) {
        return { success: false, error: 'Membership required or login failed' };
      }

      // Wait for product content to load
      await this.page.waitForSelector(selectors.productTitle, { timeout: 20000 });
      
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

        // Costco price extraction (they hide prices in screen reader text)
        let price = null;
        let warehousePrice = null;
        let onlinePrice = null;
        
        // Try multiple price selectors
        const priceSelectors = [
          '.sr-only .currency',
          '.price-current .sr-only',
          '.price .sr-only',
          '.price-range .sr-only'
        ];
        
        for (const priceSelector of priceSelectors) {
          const priceElement = document.querySelector(priceSelector);
          if (priceElement) {
            const priceText = priceElement.textContent.trim();
            const priceMatch = priceText.match(/\$?(\d+\.?\d*)/);
            if (priceMatch) {
              price = parseFloat(priceMatch[1]);
              break;
            }
          }
        }

        // Check for warehouse vs online pricing difference
        const warehousePriceElement = document.querySelector('.warehouse-price, .in-warehouse');
        if (warehousePriceElement) {
          const warehousePriceText = warehousePriceElement.textContent.trim();
          const warehousePriceMatch = warehousePriceText.match(/\$?(\d+\.?\d*)/);
          if (warehousePriceMatch) {
            warehousePrice = parseFloat(warehousePriceMatch[1]);
          }
        }

        const onlinePriceElement = document.querySelector('.online-price, .costco-com-price');
        if (onlinePriceElement) {
          const onlinePriceText = onlinePriceElement.textContent.trim();
          const onlinePriceMatch = onlinePriceText.match(/\$?(\d+\.?\d*)/);
          if (onlinePriceMatch) {
            onlinePrice = parseFloat(onlinePriceMatch[1]);
          }
        }

        return {
          title: getTextContent(sel.productTitle),
          price: price,
          warehousePrice: warehousePrice,
          onlinePrice: onlinePrice,
          imageUrl: getImageSrc(sel.productImage),
          availability: !isElementPresent(sel.outOfStock) && isElementPresent(sel.availability),
          membershipRequired: isElementPresent(sel.membership),
          addToCartAvailable: isElementPresent(sel.addToCart),
          scrapedAt: new Date().toISOString(),
          currency: 'USD'
        };
      }, selectors);

      // Additional Costco specific checks
      await this.checkKirklandBrand(productData);
      await this.checkBulkQuantity(productData);
      await this.checkWarehouseAvailability(productData);

      logger.scraper(`Successfully scraped Costco product: ${productData.title}`);
      
      return {
        success: true,
        data: productData,
        website: this.websiteName,
        url
      };

    } catch (error) {
      logger.error(`Costco scraping failed for ${url}:`, error);
      return {
        success: false,
        error: error.message,
        website: this.websiteName,
        url
      };
    }
  }

  async handleCostcoCaptcha() {
    try {
      // Wait a moment to see if CAPTCHA appears
      await this.page.waitForTimeout(2000);
      
      const captchaElement = await this.page.$(this.defaultSelectors.captcha);
      
      if (captchaElement) {
        logger.scraper('Costco CAPTCHA/bot protection detected');
        
        // Check if it's just a challenge page
        const challengePage = await this.page.$('#challenge-form, .challenge');
        if (challengePage) {
          // Wait for challenge to complete automatically
          await this.page.waitForTimeout(5000);
          
          // Check if we've passed the challenge
          const stillChallenging = await this.page.$('#challenge-form, .challenge');
          if (!stillChallenging) {
            logger.scraper('Costco challenge passed automatically');
            return true;
          }
        }
        
        // For now, return false if CAPTCHA is present
        // In production, this could integrate with CAPTCHA solving services
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error handling Costco CAPTCHA:', error);
      return false;
    }
  }

  async handleMembershipRequirement() {
    try {
      // Check if membership login is required
      const membershipRequired = await this.page.$('.membership-required, .sign-in-required, .member-only');
      
      if (membershipRequired) {
        logger.scraper('Costco membership wall detected');
        
        // For now, we'll return false if membership is required
        // In production, this would handle actual membership login
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error handling Costco membership requirement:', error);
      return false;
    }
  }

  async checkKirklandBrand(productData) {
    try {
      // Check if this is a Kirkland Signature product (Costco's private label)
      const kirklandInfo = await this.page.evaluate(() => {
        const titleText = document.querySelector('h1')?.textContent || '';
        const brandElement = document.querySelector('.brand, .product-brand');
        const brandText = brandElement ? brandElement.textContent.trim() : '';
        
        const isKirkland = titleText.toLowerCase().includes('kirkland signature') || 
                          brandText.toLowerCase().includes('kirkland signature');
        
        return {
          isKirklandBrand: isKirkland,
          brand: brandText || 'Unknown'
        };
      });

      if (kirklandInfo.isKirklandBrand) {
        productData.isKirklandSignature = true;
        productData.brand = kirklandInfo.brand;
      }
    } catch (error) {
      logger.error('Error checking Kirkland brand:', error);
    }
  }

  async checkBulkQuantity(productData) {
    try {
      // Costco sells in bulk - check for quantity information
      const bulkInfo = await this.page.evaluate(() => {
        const quantityElement = document.querySelector('.quantity, .pack-size, .bulk-info');
        if (quantityElement) {
          const quantityText = quantityElement.textContent.trim();
          const quantityMatch = quantityText.match(/(\d+)\s*(pack|count|ct|pcs|pieces)/i);
          
          return {
            hasBulkInfo: true,
            bulkQuantity: quantityMatch ? parseInt(quantityMatch[1]) : null,
            bulkUnit: quantityMatch ? quantityMatch[2] : null,
            rawBulkInfo: quantityText
          };
        }
        return { hasBulkInfo: false };
      });

      if (bulkInfo.hasBulkInfo) {
        productData.bulkQuantity = bulkInfo.bulkQuantity;
        productData.bulkUnit = bulkInfo.bulkUnit;
        productData.bulkInfo = bulkInfo.rawBulkInfo;
      }
    } catch (error) {
      logger.error('Error checking bulk quantity:', error);
    }
  }

  async checkWarehouseAvailability(productData) {
    try {
      // Check warehouse vs online availability
      const availabilityInfo = await this.page.evaluate(() => {
        const warehouseElement = document.querySelector('.warehouse-availability, .in-warehouse');
        const onlineElement = document.querySelector('.online-availability, .costco-com');
        
        return {
          availableInWarehouse: warehouseElement ? !warehouseElement.textContent.includes('unavailable') : null,
          availableOnline: onlineElement ? !onlineElement.textContent.includes('unavailable') : null
        };
      });

      productData.warehouseAvailability = availabilityInfo.availableInWarehouse;
      productData.onlineAvailability = availabilityInfo.availableOnline;
    } catch (error) {
      logger.error('Error checking warehouse availability:', error);
    }
  }

  // Costco specific search functionality
  async searchProducts(query, limit = 20) {
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      const searchUrl = `${this.baseUrl}/s?dept=All&keyword=${encodeURIComponent(query)}`;
      
      logger.scraper(`Searching Costco for: ${query}`);
      
      await this.navigateWithRetry(searchUrl);
      
      // Handle CAPTCHA on search page
      if (!(await this.handleCostcoCaptcha())) {
        return { success: false, error: 'CAPTCHA detected on search page' };
      }
      
      // Wait for search results
      await this.page.waitForSelector('.product, .product-tile', { timeout: 15000 });

      const searchResults = await this.page.evaluate((maxResults) => {
        const productCards = document.querySelectorAll('.product, .product-tile');
        const results = [];

        for (let i = 0; i < Math.min(productCards.length, maxResults); i++) {
          const card = productCards[i];
          
          const titleElement = card.querySelector('h3, .description a, .product-title');
          const priceElement = card.querySelector('.price .sr-only, .price-current');
          const linkElement = card.querySelector('a');
          const imageElement = card.querySelector('img');

          if (titleElement && linkElement) {
            results.push({
              title: titleElement.textContent.trim(),
              price: priceElement ? priceElement.textContent.trim() : 'Price not available',
              url: linkElement.href.startsWith('http') ? linkElement.href : `${this.baseUrl}${linkElement.href}`,
              imageUrl: imageElement ? imageElement.src : null
            });
          }
        }

        return results;
      }, limit);

      logger.scraper(`Found ${searchResults.length} Costco products for query: ${query}`);
      
      return {
        success: true,
        results: searchResults,
        website: this.websiteName,
        query
      };

    } catch (error) {
      logger.error(`Costco search failed for "${query}":`, error);
      return {
        success: false,
        error: error.message,
        website: this.websiteName,
        query
      };
    }
  }

  // Override rate limiting for Costco (more aggressive)
  async delay(ms = this.rateLimit) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Override navigation with extra protection
  async navigateWithRetry(url, retries = this.maxRetries) {
    for (let i = 0; i < retries; i++) {
      try {
        // Extra delay before navigation for Costco
        if (i > 0) await this.delay(5000);
        
        await this.page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        return true;
      } catch (error) {
        logger.error(`Navigation attempt ${i + 1} failed for ${url}:`, error);
        if (i === retries - 1) throw error;
      }
    }
  }
}

module.exports = CostcoScraper;