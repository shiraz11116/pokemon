const BaseScraper = require('./baseScraper');
const logger = require('../utils/logger');

class PokemonCenterScraper extends BaseScraper {
  constructor() {
    super('Pokemon Center');
    this.baseUrl = 'https://www.pokemoncenter.com';
    this.defaultSelectors = {
      price: '.price, .product-price, [data-testid="price-current"]',
      availability: '.add-to-cart, .btn-add-to-cart, [data-testid="add-to-bag"]',
      addToCart: '.add-to-cart:not([disabled]), .btn-add-to-cart:not([disabled])',
      productTitle: 'h1.product-name, h1[data-testid="product-name"]',
      productImage: '.product-image img, [data-testid="product-image"] img'
    };
  }

  async scrapeProduct(url, customSelectors = {}) {
    const selectors = { ...this.defaultSelectors, ...customSelectors };
    
    try {
      if (!this.browser) {
        await this.initBrowser();
      }

      logger.scraper(`Scraping Pokemon Center product: ${url}`);
      
      await this.navigateWithRetry(url);
      
      // Handle CAPTCHA if present
      if (!(await this.handleCaptcha())) {
        return { success: false, error: 'CAPTCHA detected' };
      }

      // Pokemon Center might have loading delays
      await this.randomDelay(3000, 5000);
      
      // Wait for product content to load
      await this.page.waitForSelector(selectors.productTitle, { timeout: 15000 });
      
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
          '.price',
          '.product-price',
          '[data-testid="price-current"]',
          '.price-current'
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
        const soldOutIndicator = document.querySelector('.sold-out, .out-of-stock, [data-testid="sold-out"]');
        let availabilityText = 'Unknown';
        
        if (soldOutIndicator) {
          availabilityText = 'Sold Out';
        } else if (addToCartButton && !addToCartButton.disabled) {
          availabilityText = 'In Stock';
        } else {
          availabilityText = 'Out of Stock';
        }
        
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
        website: 'pokemoncenter',
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
      
      logger.scraper(`Pokemon Center scraping successful: ${productData.title} - $${price}`);
      return result;
      
    } catch (error) {
      logger.error(`Pokemon Center scraping failed for ${url}:`, error);
      return {
        success: false,
        website: 'pokemoncenter',
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

      logger.scraper(`Adding Pokemon Center product to cart: ${url}`);
      
      await this.navigateWithRetry(url);
      
      // Handle CAPTCHA if present
      if (!(await this.handleCaptcha())) {
        return { success: false, error: 'CAPTCHA detected' };
      }

      // Wait longer for Pokemon Center to load
      await this.randomDelay(3000, 5000);
      
      // Wait for add to cart button
      await this.page.waitForSelector(selectors.addToCart, { timeout: 15000 });
      
      // Check if item is available
      const isAvailable = await this.page.evaluate((sel) => {
        const button = document.querySelector(sel.addToCart);
        const soldOut = document.querySelector('.sold-out, .out-of-stock');
        return button && !button.disabled && !soldOut;
      }, selectors);
      
      if (!isAvailable) {
        return { success: false, error: 'Product not available for purchase' };
      }
      
      // Set quantity if needed
      const quantitySelector = '.qty-input, input[name="qty"], [data-testid="quantity-input"]';
      try {
        const quantityInput = await this.page.$(quantitySelector);
        if (quantityInput && quantity > 1) {
          await this.page.click(quantitySelector);
          await this.page.keyboard.selectAll();
          await this.page.keyboard.type(quantity.toString());
          await this.randomDelay(1000, 2000);
        }
      } catch (e) {
        // Quantity selector might not exist
      }
      
      // Click add to cart
      await this.page.click(selectors.addToCart);
      await this.randomDelay(3000, 5000);
      
      // Check if added successfully
      const success = await this.page.evaluate(() => {
        // Look for cart confirmation or cart count update
        const cartConfirm = document.querySelector('.cart-confirmation, .added-to-cart, [data-testid="cart-confirmation"]');
        const cartCount = document.querySelector('.cart-count, [data-testid="cart-count"]');
        
        return cartConfirm || (cartCount && parseInt(cartCount.textContent) > 0);
      });
      
      if (success) {
        logger.scraper(`Successfully added Pokemon Center product to cart`);
        return {
          success: true,
          website: 'pokemoncenter',
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
      logger.error(`Pokemon Center add to cart failed:`, error);
      return {
        success: false,
        website: 'pokemoncenter',
        error: error.message
      };
    }
  }
}

module.exports = PokemonCenterScraper;