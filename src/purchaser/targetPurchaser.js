const BasePurchaser = require('./basePurchaser');
const logger = require('../utils/logger');

class TargetPurchaser extends BasePurchaser {
  constructor() {
    super('Target');
    this.checkoutSelectors = {
      // Cart page
      cartButton: '[data-test="cart-link"]',
      checkoutButton: '[data-test="checkout-button"]',
      
      // Guest checkout
      continueAsGuest: '[data-test="guest-checkout-button"]',
      
      // Shipping information
      firstName: '[data-test="firstName"]',
      lastName: '[data-test="lastName"]',
      address: '[data-test="address1"]',
      city: '[data-test="city"]',
      state: '[data-test="state"]',
      zipCode: '[data-test="zipCode"]',
      email: '[data-test="email"]',
      phone: '[data-test="phone"]',
      
      // Payment information
      cardNumber: '[data-test="cardNumber"]',
      expiryMonth: '[data-test="expiryMonth"]',
      expiryYear: '[data-test="expiryYear"]',
      cvv: '[data-test="cvv"]',
      cardholderName: '[data-test="cardName"]',
      
      // Billing address (if different)
      billingAddress: '[data-test="billingAddress1"]',
      billingCity: '[data-test="billingCity"]',
      billingState: '[data-test="billingState"]',
      billingZipCode: '[data-test="billingZipCode"]',
      
      // Final checkout
      placeOrderButton: '[data-test="place-order-button"]',
      
      // Confirmation
      orderConfirmation: '[data-test="order-confirmation"]'
    };
  }

  async executePurchase(purchaseData) {
    const { purchase, creditCard, url, quantity } = purchaseData;
    
    try {
      logger.info(`Starting Target purchase for: ${purchase.sku.name}`);
      
      await this.initBrowser();
      
      // Step 1: Navigate to product and add to cart
      await this.addToCart(url, quantity);
      
      // Step 2: Navigate to cart
      await this.goToCart();
      
      // Step 3: Proceed to checkout
      await this.proceedToCheckout();
      
      // Step 4: Fill shipping information
      await this.fillShippingInfo(creditCard);
      
      // Step 5: Fill payment information
      await this.fillPaymentInfo(creditCard);
      
      // Step 6: Place order
      const orderInfo = await this.placeOrder();
      
      await this.closeBrowser();
      
      logger.info(`Target purchase completed successfully`);
      
      return {
        success: true,
        website: 'target',
        orderId: orderInfo.orderId,
        confirmationNumber: orderInfo.confirmationNumber,
        transactionId: orderInfo.transactionId
      };
      
    } catch (error) {
      await this.closeBrowser();
      logger.error(`Target purchase failed:`, error);
      
      return {
        success: false,
        website: 'target',
        error: error.message
      };
    }
  }

  async addToCart(url, quantity) {
    await this.navigateWithRetry(url);
    
    // Wait for product page to load
    await this.page.waitForSelector('[data-test="product-title"]', { timeout: 15000 });
    
    // Set quantity if needed
    const quantitySelector = '[data-test="quantity-input"]';
    try {
      const quantityInput = await this.page.$(quantitySelector);
      if (quantityInput && quantity > 1) {
        await this.fillField(quantitySelector, quantity.toString(), { clear: true });
      }
    } catch (e) {
      // Quantity field might not exist
    }
    
    // Click add to cart
    const addToCartSelectors = [
      '[data-test="chooseOptionsButton"]',
      '[data-test="orderPickupButton"]',
      '[data-test="shipItButton"]'
    ];
    
    for (const selector of addToCartSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await this.clickWithRetry(selector);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Wait for cart confirmation
    await this.randomDelay(2000, 3000);
    
    // Close any modals
    try {
      const modalClose = await this.page.$('[data-test="modal-close"]');
      if (modalClose) {
        await modalClose.click();
      }
    } catch (e) {
      // Modal might not exist
    }
    
    logger.info('Product added to Target cart');
  }

  async goToCart() {
    await this.clickWithRetry(this.checkoutSelectors.cartButton);
    await this.waitForNavigation();
    
    // Wait for cart page to load
    await this.page.waitForSelector('[data-test="cart-item"]', { timeout: 10000 });
    logger.info('Navigated to Target cart');
  }

  async proceedToCheckout() {
    await this.clickWithRetry(this.checkoutSelectors.checkoutButton);
    await this.waitForNavigation();
    
    // Handle guest checkout if needed
    try {
      const guestButton = await this.page.$(this.checkoutSelectors.continueAsGuest);
      if (guestButton) {
        await this.clickWithRetry(this.checkoutSelectors.continueAsGuest);
        await this.waitForNavigation();
      }
    } catch (e) {
      // Guest checkout might not be needed if already logged in
    }
    
    logger.info('Proceeded to Target checkout');
  }

  async fillShippingInfo(creditCard) {
    const address = creditCard.billingAddress;
    
    // Fill shipping address
    await this.fillField(this.checkoutSelectors.firstName, creditCard.cardholderName.split(' ')[0]);
    await this.fillField(this.checkoutSelectors.lastName, creditCard.cardholderName.split(' ').slice(1).join(' ') || 'Doe');
    await this.fillField(this.checkoutSelectors.address, address.street);
    await this.fillField(this.checkoutSelectors.city, address.city);
    await this.fillField(this.checkoutSelectors.state, address.state);
    await this.fillField(this.checkoutSelectors.zipCode, address.zipCode);
    
    // Email and phone (use dummy data)
    await this.fillField(this.checkoutSelectors.email, 'buyer@example.com');
    await this.fillField(this.checkoutSelectors.phone, '5551234567');
    
    // Continue to payment
    try {
      await this.clickWithRetry('[data-test="continue-to-payment"]');
      await this.waitForNavigation();
    } catch (e) {
      // Button might have different selector
      await this.randomDelay(2000, 3000);
    }
    
    logger.info('Shipping information filled for Target');
  }

  async fillPaymentInfo(creditCard) {
    // Wait for payment section
    await this.page.waitForSelector(this.checkoutSelectors.cardNumber, { timeout: 15000 });
    
    // Fill credit card information
    await this.fillCreditCardInfo(creditCard, {
      cardNumber: this.checkoutSelectors.cardNumber,
      expiryMonth: this.checkoutSelectors.expiryMonth,
      expiryYear: this.checkoutSelectors.expiryYear,
      cvv: this.checkoutSelectors.cvv,
      cardholderName: this.checkoutSelectors.cardholderName
    });
    
    // Fill billing address if different from shipping
    try {
      const billingCheckbox = await this.page.$('[data-test="use-different-billing"]');
      if (billingCheckbox) {
        await billingCheckbox.click();
        await this.randomDelay();
        
        await this.fillBillingAddress(creditCard, {
          street: this.checkoutSelectors.billingAddress,
          city: this.checkoutSelectors.billingCity,
          state: this.checkoutSelectors.billingState,
          zipCode: this.checkoutSelectors.billingZipCode
        });
      }
    } catch (e) {
      // Billing address form might not be needed
    }
    
    logger.info('Payment information filled for Target');
  }

  async placeOrder() {
    // Handle CAPTCHA if present
    if (!(await this.handleCaptcha())) {
      throw new Error('CAPTCHA detected and not resolved');
    }
    
    // Click place order
    await this.clickWithRetry(this.checkoutSelectors.placeOrderButton);
    
    // Wait for order confirmation page
    try {
      await this.page.waitForSelector(this.checkoutSelectors.orderConfirmation, { timeout: 30000 });
    } catch (e) {
      // Try alternative confirmation selectors
      await this.page.waitForSelector('.order-summary, .confirmation-page', { timeout: 10000 });
    }
    
    // Extract order information
    const orderInfo = await this.extractOrderInfo();
    
    logger.info('Target order placed successfully');
    return orderInfo;
  }
}

module.exports = TargetPurchaser;