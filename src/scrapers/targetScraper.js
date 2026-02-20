const BaseScraper = require('./baseScraper');
const logger = require('../utils/logger');

class TargetScraper extends BaseScraper {
  constructor() {
    super('Target');
    this.baseUrl = 'https://www.target.com';
    this.defaultSelectors = {
      price: '[data-test="product-price"], .h-text-red, .sr-only',
      availability: '[data-test="fulfillment-add-to-cart"], [data-test="preorderButton"]',
      addToCart: '[data-test="chooseOptionsButton"], [data-test="orderPickupButton"], [data-test="shipItButton"]',
      productTitle: 'h1[data-test="product-title"]',
      productImage: 'img[data-test="hero-image-desktop"]'
    };
  }

  async scrapeProduct(url, customSelectors = {}) {
    const selectors = { ...this.defaultSelectors, ...customSelectors };
    
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      logger.scraper(`Scraping Target product: ${url}`);
      
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
        
        return {
          title: getTextContent(sel.productTitle),
          priceText: getTextContent(sel.price),
          availabilityText: getTextContent(sel.availability),
          imageUrl: getAttributeContent(sel.productImage, 'src'),
          url: window.location.href
        };
      }, selectors);
      
      // Process extracted data
      const price = this.extractPrice(productData.priceText);
      const inStock = this.isInStock(productData.availabilityText);
      
      const result = {
        success: true,
        website: 'target',
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
      
      logger.scraper(`Target scraping successful: ${productData.title} - $${price}`);
      return result;
      
    } catch (error) {
      logger.error(`Target scraping failed for ${url}:`, error);
      return {
        success: false,
        website: 'target',
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

      logger.scraper(`Adding Target product to cart: ${url}`);
      
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
        return button && !button.disabled;
      }, selectors);
      
      if (!isAvailable) {
        return { success: false, error: 'Product not available for purchase' };
      }
      
      // Set quantity if needed
      const quantitySelector = 'input[data-test="quantity-input"]';
      const quantityExists = await this.page.$(quantitySelector) !== null;
      
      if (quantityExists && quantity > 1) {
        await this.page.click(quantitySelector);
        await this.page.keyboard.selectAll();
        await this.page.keyboard.type(quantity.toString());
        await this.randomDelay(1000, 2000);
      }
      
      // Click add to cart
      await this.page.click(selectors.addToCart);
      await this.randomDelay(2000, 3000);
      
      // Check if added successfully
      const success = await this.page.evaluate(() => {
        return document.querySelector('[data-test="modal-drawer-heading"]')?.textContent?.includes('Added to cart') || 
               document.querySelector('.styles__StyledHeading')?.textContent?.includes('Added to cart');
      });
      
      if (success) {
        logger.scraper(`Successfully added Target product to cart`);
        return {
          success: true,
          website: 'target',
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
      logger.error(`Target add to cart failed:`, error);
      return {
        success: false,
        website: 'target',
        error: error.message
      };
    }
  }

  // Get cart items
  async getCartItems() {
    try {
      await this.page.goto('https://www.target.com/cart', { waitUntil: 'networkidle2' });
      await this.randomDelay();
      
      const cartItems = await this.page.evaluate(() => {
        const items = [];
        const cartElements = document.querySelectorAll('[data-test="cart-item"]');
        
        cartElements.forEach(item => {
          const title = item.querySelector('h3')?.textContent?.trim();
          const price = item.querySelector('[data-test="price"]')?.textContent?.trim();
          const quantity = item.querySelector('[data-test="quantity-input"]')?.value;
          
          if (title) {
            items.push({ title, price, quantity });
          }
        });
        
        return items;
      });
      
      return { success: true, items: cartItems };
    } catch (error) {
      logger.error('Failed to get Target cart items:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = TargetScraper;