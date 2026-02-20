const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const CreditCard = require('../models/CreditCard');

class BasePurchaser {
  constructor(websiteName) {
    this.websiteName = websiteName;
    this.browser = null;
    this.page = null;
    this.isCancelled = false;
  }

  // Initialize browser for purchasing
  async initBrowser() {
    try {
      this.browser = await puppeteer.launch({
        headless: false, // Show browser for debugging purchases
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--start-maximized'
        ],
        defaultViewport: null
      });
      
      this.page = await this.browser.newPage();
      
      // Set user agent
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      logger.info(`Browser initialized for ${this.websiteName} purchase`);
    } catch (error) {
      logger.error(`Failed to initialize browser for ${this.websiteName}:`, error);
      throw error;
    }
  }

  // Close browser
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      logger.info(`Browser closed for ${this.websiteName}`);
    }
  }

  // Random delay
  async randomDelay(min = 1000, max = 3000) {
    if (this.isCancelled) throw new Error('Purchase cancelled');
    
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Navigate to URL with retry
  async navigateWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.isCancelled) throw new Error('Purchase cancelled');
        
        await this.page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        await this.randomDelay();
        return true;
      } catch (error) {
        logger.error(`Navigation attempt ${attempt} failed for ${this.websiteName}:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.randomDelay(3000, 5000);
      }
    }
  }

  // Fill form field
  async fillField(selector, value, options = {}) {
    if (this.isCancelled) throw new Error('Purchase cancelled');
    
    try {
      await this.page.waitForSelector(selector, { timeout: 10000 });
      
      if (options.clear) {
        await this.page.click(selector, { clickCount: 3 });
      }
      
      await this.page.type(selector, value, { delay: options.delay || 100 });
      await this.randomDelay(500, 1000);
      
    } catch (error) {
      logger.error(`Failed to fill field ${selector}:`, error);
      throw error;
    }
  }

  // Click element with retry
  async clickWithRetry(selector, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.isCancelled) throw new Error('Purchase cancelled');
        
        await this.page.waitForSelector(selector, { timeout: 10000 });
        await this.page.click(selector);
        await this.randomDelay();
        return true;
      } catch (error) {
        logger.error(`Click attempt ${attempt} failed for ${selector}:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.randomDelay(1000, 2000);
      }
    }
  }

  // Wait for navigation
  async waitForNavigation(timeout = 30000) {
    if (this.isCancelled) throw new Error('Purchase cancelled');
    
    try {
      await this.page.waitForNavigation({ 
        waitUntil: 'networkidle0', 
        timeout 
      });
    } catch (error) {
      // Navigation might not occur, continue
      logger.warn(`Navigation timeout for ${this.websiteName}`);
    }
  }

  // Fill credit card information
  async fillCreditCardInfo(creditCard, selectors) {
    try {
      // Decrypt card data
      const cardNumber = CreditCard.decryptCardData(creditCard.encryptedCardNumber);
      const cvv = CreditCard.decryptCardData(creditCard.encryptedCVV);
      
      // Fill card number
      if (selectors.cardNumber) {
        await this.fillField(selectors.cardNumber, cardNumber, { clear: true, delay: 150 });
      }
      
      // Fill expiry month
      if (selectors.expiryMonth) {
        await this.fillField(selectors.expiryMonth, creditCard.expiryMonth, { clear: true });
      }
      
      // Fill expiry year
      if (selectors.expiryYear) {
        await this.fillField(selectors.expiryYear, creditCard.expiryYear, { clear: true });
      }
      
      // Fill CVV
      if (selectors.cvv) {
        await this.fillField(selectors.cvv, cvv, { clear: true, delay: 150 });
      }
      
      // Fill cardholder name
      if (selectors.cardholderName) {
        await this.fillField(selectors.cardholderName, creditCard.cardholderName, { clear: true });
      }
      
      logger.info(`Credit card information filled for ${this.websiteName}`);
      
    } catch (error) {
      logger.error(`Error filling credit card info for ${this.websiteName}:`, error);
      throw error;
    }
  }

  // Fill billing address
  async fillBillingAddress(creditCard, selectors) {
    try {
      const address = creditCard.billingAddress;
      
      if (selectors.street && address.street) {
        await this.fillField(selectors.street, address.street, { clear: true });
      }
      
      if (selectors.city && address.city) {
        await this.fillField(selectors.city, address.city, { clear: true });
      }
      
      if (selectors.state && address.state) {
        await this.fillField(selectors.state, address.state, { clear: true });
      }
      
      if (selectors.zipCode && address.zipCode) {
        await this.fillField(selectors.zipCode, address.zipCode, { clear: true });
      }
      
      if (selectors.country && address.country) {
        await this.fillField(selectors.country, address.country, { clear: true });
      }
      
      logger.info(`Billing address filled for ${this.websiteName}`);
      
    } catch (error) {
      logger.error(`Error filling billing address for ${this.websiteName}:`, error);
      throw error;
    }
  }

  // Handle CAPTCHA
  async handleCaptcha() {
    try {
      const captchaExists = await this.page.$('.captcha, #captcha, [data-captcha]') !== null;
      
      if (captchaExists) {
        logger.warn(`CAPTCHA detected on ${this.websiteName} during purchase`);
        // Wait for manual solving
        await this.randomDelay(30000, 45000);
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error handling CAPTCHA:', error);
      return false;
    }
  }

  // Cancel purchase
  async cancel() {
    this.isCancelled = true;
    await this.closeBrowser();
    logger.info(`Purchase cancelled for ${this.websiteName}`);
  }

  // Extract order information from confirmation page
  async extractOrderInfo() {
    try {
      const orderInfo = await this.page.evaluate(() => {
        // Common patterns for order information
        const getTextByPattern = (patterns) => {
          for (const pattern of patterns) {
            const element = document.querySelector(pattern);
            if (element) {
              return element.textContent.trim();
            }
          }
          return null;
        };
        
        return {
          orderId: getTextByPattern([
            '[data-testid="order-id"]',
            '.order-number',
            '.confirmation-number',
            '#order-id'
          ]),
          confirmationNumber: getTextByPattern([
            '[data-testid="confirmation-number"]',
            '.confirmation-code',
            '.order-confirmation'
          ]),
          totalAmount: getTextByPattern([
            '[data-testid="total-amount"]',
            '.total-price',
            '.order-total'
          ])
        };
      });
      
      return orderInfo;
    } catch (error) {
      logger.error('Error extracting order info:', error);
      return {};
    }
  }

  // Abstract method to be implemented by child classes
  async executePurchase(purchaseData) {
    throw new Error('executePurchase method must be implemented by child class');
  }
}

module.exports = BasePurchaser;