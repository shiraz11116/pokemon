const BaseScraper = require('./baseScraper');
const logger = require('../utils/logger');

class BestBuyScraper extends BaseScraper {
  constructor() {
    super('BestBuy');
    this.baseUrl = 'https://www.bestbuy.com';
    this.defaultSelectors = {
      price: '.pricing-price__range, .sr-only:contains("current price"), .visually-hidden:contains("current price")',
      availability: '.add-to-cart-button, .fulfillment-add-to-cart-button, .btn-disabled',
      addToCart: '.add-to-cart-button:not(.btn-disabled)',
      productTitle: 'h1.heading-5',
      productImage: '.primary-image img'
    };
  }

  async scrapeProduct(url, customSelectors = {}) {
    const selectors = { ...this.defaultSelectors, ...customSelectors };
    
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      logger.scraper(`Scraping BestBuy product: ${url}`);
      
      await this.navigateWithRetry(url);
      
      // Handle CAPTCHA if present
      if (!(await this.handleCaptcha())) {
        return { success: false, error: 'CAPTCHA detected' };
      }

      // Wait for product content to load
      await this.page.waitForSelector(selectors.productTitle, { timeout: 10000 });
      
      // Extract product data
      const productData = await this.page.evaluate((sel) => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : null;
        };
        
        const getAttributeContent = (selector, attribute) => {
          const element = document.querySelector(selector);
          return element ? element.getAttribute(attribute) : null;
        };
        
        // Extract price from multiple possible selectors
        let priceText = null;
        const priceSelectors = [
          '.pricing-price__range',
          '.sr-only[aria-label*="current price"]',
          '.visually-hidden[aria-label*="current price"]',
          '.pricing-current-price'
        ];
        
        for (const priceSelector of priceSelectors) {
          const priceElement = document.querySelector(priceSelector);
          if (priceElement) {
            priceText = priceElement.textContent.trim();
            break;
          }
        }
        
        // Check availability
        const addToCartButton = document.querySelector(sel.addToCart);
        const isButtonDisabled = document.querySelector('.btn-disabled, .add-to-cart-button[disabled]');
        const availabilityText = addToCartButton ? 
          (isButtonDisabled ? 'Out of Stock' : 'Add to Cart') : 
          'Unavailable';
        
        return {
          title: getTextContent(sel.productTitle),
          priceText: priceText,
          availabilityText: availabilityText,
          imageUrl: getAttributeContent(sel.productImage, 'src'),
          url: window.location.href
        };
      }, selectors);
      
      // Process extracted data
      const price = this.extractPrice(productData.priceText);
      const inStock = this.isInStock(productData.availabilityText);
      
      const result = {
        success: true,
        website: 'bestbuy',
        url: productData.url,
        title: productData.title,
        price: price,
        priceText: productData.priceText,
        inStock: inStock,
        availability: productData.availabilityText,
        imageUrl: productData.imageUrl,
        scrapedAt: new Date(),
        selectors: selectors
      };
      
      logger.scraper(`BestBuy scraping successful: ${productData.title} - $${price}`);
      return result;
      
    } catch (error) {
      logger.error(`BestBuy scraping failed for ${url}:`, error);
      return {
        success: false,
        website: 'bestbuy',
        url: url,
        error: error.message,
        scrapedAt: new Date()
      };
    }
  }

  async addToCart(url, customSelectors = {}, quantity = 1) {
    const selectors = { ...this.defaultSelectors, ...customSelectors };
    
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      logger.scraper(`Adding BestBuy product to cart: ${url}`);
      
      await this.navigateWithRetry(url);
      
      // Handle CAPTCHA if present
      if (!(await this.handleCaptcha())) {
        return { success: false, error: 'CAPTCHA detected' };
      }

      // Wait for add to cart button
      await this.page.waitForSelector(selectors.addToCart, { timeout: 10000 });
      
      // Check if item is available
      const isAvailable = await this.page.evaluate((sel) => {
        const button = document.querySelector(sel.addToCart);
        return button && !button.disabled && !button.classList.contains('btn-disabled');
      }, selectors);
      
      if (!isAvailable) {
        return { success: false, error: 'Product not available for purchase' };
      }
      
      // Click add to cart
      await this.page.click(selectors.addToCart);
      await this.randomDelay(3000, 5000);
      
      // Handle any popups or modals
      try {
        const modalClose = await this.page.$('.modal-close, .c-close-icon');
        if (modalClose) {
          await modalClose.click();
          await this.randomDelay(1000, 2000);
        }
      } catch (e) {
        // Modal might not exist, continue
      }
      
      // Check if added successfully by looking for cart indicator
      const success = await this.page.evaluate(() => {
        const cartCount = document.querySelector('.cart-link .sr-only');
        return cartCount && parseInt(cartCount.textContent) > 0;
      });
      
      if (success) {
        logger.scraper(`Successfully added BestBuy product to cart`);
        return {
          success: true,
          website: 'bestbuy',
          message: 'Product added to cart',
          quantity: quantity
        };
      } else {
        return {
          success: false,
          error: 'Failed to confirm cart addition'
        };
      }
      
    } catch (error) {
      logger.error(`BestBuy add to cart failed:`, error);
      return {
        success: false,
        website: 'bestbuy',
        error: error.message
      };
    }
  }
}

module.exports = BestBuyScraper;