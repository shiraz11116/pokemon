const cron = require('node-cron');
const logger = require('../utils/logger');
const emailService = require('../utils/email');

// Import models
const Purchase = require('../models/Purchase');
const SKU = require('../models/SKU');
const CreditCard = require('../models/CreditCard');
const User = require('../models/User');

// Import purchasers
const TargetPurchaser = require('./targetPurchaser');
const BestBuyPurchaser = require('./bestbuyPurchaser');
const PokemonCenterPurchaser = require('./pokemonCenterPurchaser');

class PurchaseManager {
  constructor() {
    this.purchasers = {
      target: new TargetPurchaser(),
      bestbuy: new BestBuyPurchaser(),
      pokemoncenter: new PokemonCenterPurchaser()
    };
    
    this.isRunning = false;
    this.cronJobs = [];
    this.purchaseQueue = [];
    this.activePurchases = new Map();
    this.maxConcurrentPurchases = 3;
  }

  // Start purchase manager
  async start() {
    if (this.isRunning) {
      logger.info('Purchase Manager is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Purchase Manager...');

    // Process pending purchases every 30 seconds
    const processingJob = cron.schedule('*/30 * * * * *', () => {
      this.processPendingPurchases();
    });

    // Retry failed purchases every 10 minutes
    const retryJob = cron.schedule('*/10 * * * *', () => {
      this.retryFailedPurchases();
    });

    // Cleanup completed purchases every hour
    const cleanupJob = cron.schedule('0 * * * *', () => {
      this.cleanup();
    });

    this.cronJobs = [processingJob, retryJob, cleanupJob];
    
    // Start initial processing
    setTimeout(() => {
      this.processPendingPurchases();
    }, 2000);

    logger.info('Purchase Manager started successfully');
  }

  // Stop purchase manager
  async stop() {
    this.isRunning = false;
    
    // Stop all cron jobs
    this.cronJobs.forEach(job => job.destroy());
    this.cronJobs = [];
    
    // Cancel active purchases
    for (const [purchaseId, purchaser] of this.activePurchases.entries()) {
      try {
        await purchaser.cancel();
        logger.info(`Cancelled active purchase: ${purchaseId}`);
      } catch (error) {
        logger.error(`Error cancelling purchase ${purchaseId}:`, error);
      }
    }
    
    this.activePurchases.clear();
    
    logger.info('Purchase Manager stopped');
  }

  // Process pending purchases
  async processPendingPurchases() {
    if (!this.isRunning) return;

    try {
      // Check if we're at max capacity
      if (this.activePurchases.size >= this.maxConcurrentPurchases) {
        return;
      }

      // Get pending purchases
      const pendingPurchases = await Purchase.find({
        status: 'pending',
        'attemptInfo.attemptNumber': { $lte: 3 }
      })
      .populate('sku')
      .populate('createdBy')
      .sort({ createdAt: 1 })
      .limit(this.maxConcurrentPurchases - this.activePurchases.size);

      if (pendingPurchases.length === 0) {
        return;
      }

      logger.info(`Processing ${pendingPurchases.length} pending purchases`);

      // Process each purchase
      for (const purchase of pendingPurchases) {
        try {
          await this.processPurchase(purchase);
        } catch (error) {
          logger.error(`Error processing purchase ${purchase._id}:`, error);
          await this.handlePurchaseError(purchase, error.message);
        }
      }

    } catch (error) {
      logger.error('Error in processPendingPurchases:', error);
    }
  }

  // Process individual purchase
  async processPurchase(purchase) {
    const websiteName = purchase.website.name;
    const purchaser = this.purchasers[websiteName];
    
    if (!purchaser) {
      throw new Error(`No purchaser found for website: ${websiteName}`);
    }

    // Update purchase status
    purchase.status = 'processing';
    purchase.attemptInfo.lastAttempt = new Date();
    await purchase.save();

    // Add to active purchases
    this.activePurchases.set(purchase._id.toString(), purchaser);

    logger.purchase(`Starting purchase attempt ${purchase.attemptInfo.attemptNumber} for ${purchase.sku.name}`, {
      purchaseId: purchase._id,
      website: websiteName,
      price: purchase.purchaseDetails.price
    });

    try {
      // Get user's default credit card
      const creditCard = await CreditCard.findOne({
        createdBy: purchase.createdBy._id,
        isDefault: true,
        isActive: true,
        websites: websiteName
      });

      if (!creditCard) {
        throw new Error('No valid credit card found for this website');
      }

      // Execute purchase
      const result = await purchaser.executePurchase({
        purchase,
        creditCard,
        url: purchase.website.url,
        quantity: purchase.purchaseDetails.quantity
      });

      // Handle result
      if (result.success) {
        await this.handlePurchaseSuccess(purchase, result);
      } else {
        await this.handlePurchaseError(purchase, result.error);
      }

    } catch (error) {
      await this.handlePurchaseError(purchase, error.message);
    } finally {
      // Remove from active purchases
      this.activePurchases.delete(purchase._id.toString());
    }
  }

  // Handle successful purchase
  async handlePurchaseSuccess(purchase, result) {
    try {
      // Update purchase record
      purchase.status = 'success';
      purchase.orderInfo = {
        orderId: result.orderId,
        confirmationNumber: result.confirmationNumber,
        trackingNumber: result.trackingNumber,
        estimatedDelivery: result.estimatedDelivery
      };
      purchase.paymentInfo.transactionId = result.transactionId;
      purchase.paymentInfo.paymentStatus = 'captured';
      
      await purchase.save();

      logger.purchase(`Purchase successful: ${purchase.sku.name}`, {
        purchaseId: purchase._id,
        orderId: result.orderId,
        amount: purchase.purchaseDetails.totalAmount
      });

      // Send success email
      if (purchase.createdBy && purchase.createdBy.settings.emailNotifications) {
        await emailService.sendPurchaseSuccess(
          purchase.createdBy.email,
          {
            productName: purchase.sku.name,
            price: purchase.purchaseDetails.price,
            quantity: purchase.purchaseDetails.quantity,
            website: purchase.website.name,
            orderId: result.orderId,
            totalAmount: purchase.purchaseDetails.totalAmount
          }
        );
        
        purchase.notifications.emailSent = true;
        purchase.notifications.emailTimestamp = new Date();
        purchase.notifications.notificationType = 'success';
        await purchase.save();
      }

      // Update credit card usage stats
      if (purchase.paymentInfo.cardUsed) {
        const creditCard = await CreditCard.findById(purchase.paymentInfo.cardUsed);
        if (creditCard) {
          creditCard.usageStats.totalPurchases += 1;
          creditCard.usageStats.totalAmount += purchase.purchaseDetails.totalAmount;
          creditCard.usageStats.lastUsed = new Date();
          await creditCard.save();
        }
      }

    } catch (error) {
      logger.error('Error handling purchase success:', error);
    }
  }

  // Handle purchase error
  async handlePurchaseError(purchase, errorMessage) {
    try {
      purchase.errors.push({
        message: errorMessage,
        timestamp: new Date(),
        errorCode: 'PURCHASE_FAILED',
        severity: 'high'
      });

      purchase.attemptInfo.attemptNumber += 1;

      // Check if max attempts reached
      if (purchase.attemptInfo.attemptNumber > purchase.attemptInfo.maxAttempts) {
        purchase.status = 'failed';
        logger.purchase(`Purchase failed permanently: ${purchase.sku.name}`, {
          purchaseId: purchase._id,
          attempts: purchase.attemptInfo.attemptNumber,
          error: errorMessage
        });
      } else {
        purchase.status = 'pending';
        logger.purchase(`Purchase attempt ${purchase.attemptInfo.attemptNumber} failed: ${purchase.sku.name}`, {
          purchaseId: purchase._id,
          error: errorMessage
        });
      }

      await purchase.save();

      // Send failure email
      if (purchase.createdBy && purchase.createdBy.settings.emailNotifications) {
        await emailService.sendPurchaseFailure(
          purchase.createdBy.email,
          {
            productName: purchase.sku.name,
            website: purchase.website.name,
            attemptNumber: purchase.attemptInfo.attemptNumber,
            maxAttempts: purchase.attemptInfo.maxAttempts
          },
          errorMessage
        );
        
        purchase.notifications.emailSent = true;
        purchase.notifications.emailTimestamp = new Date();
        purchase.notifications.notificationType = 'failure';
        await purchase.save();
      }

    } catch (error) {
      logger.error('Error handling purchase error:', error);
    }
  }

  // Retry failed purchases
  async retryFailedPurchases() {
    if (!this.isRunning) return;

    try {
      const retryPurchases = await Purchase.find({
        status: 'pending',
        'attemptInfo.attemptNumber': { $gte: 2, $lte: 3 },
        'attemptInfo.lastAttempt': {
          $lt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
        }
      }).populate('sku').populate('createdBy');

      if (retryPurchases.length > 0) {
        logger.info(`Retrying ${retryPurchases.length} failed purchases`);
        
        for (const purchase of retryPurchases) {
          if (this.activePurchases.size < this.maxConcurrentPurchases) {
            await this.processPurchase(purchase);
          }
        }
      }
    } catch (error) {
      logger.error('Error in retryFailedPurchases:', error);
    }
  }

  // Manual purchase trigger
  async manualPurchase(skuId, websiteName, userId) {
    try {
      const sku = await SKU.findById(skuId);
      const user = await User.findById(userId);
      
      if (!sku || !user) {
        throw new Error('SKU or User not found');
      }

      const website = sku.websites.find(w => w.name === websiteName);
      if (!website) {
        throw new Error('Website not configured for this SKU');
      }

      // Create purchase record
      const purchase = new Purchase({
        sku: sku._id,
        website: {
          name: websiteName,
          url: website.url
        },
        purchaseDetails: {
          price: sku.targetPrice, // Use target price for manual purchases
          quantity: sku.purchaseSettings.maxQuantity,
          totalAmount: sku.targetPrice * sku.purchaseSettings.maxQuantity
        },
        createdBy: userId
      });

      await purchase.save();
      
      logger.info(`Manual purchase queued: ${purchase._id}`);
      return purchase;
      
    } catch (error) {
      logger.error('Manual purchase error:', error);
      throw error;
    }
  }

  // Get purchase status
  async getPurchaseStatus(purchaseId) {
    try {
      const purchase = await Purchase.findById(purchaseId)
        .populate('sku')
        .populate('createdBy', 'username email');
      
      return purchase;
    } catch (error) {
      logger.error('Error getting purchase status:', error);
      throw error;
    }
  }

  // Cancel purchase
  async cancelPurchase(purchaseId) {
    try {
      const purchase = await Purchase.findById(purchaseId);
      if (!purchase) {
        throw new Error('Purchase not found');
      }

      if (['success', 'cancelled'].includes(purchase.status)) {
        throw new Error('Cannot cancel completed or already cancelled purchase');
      }

      purchase.status = 'cancelled';
      await purchase.save();

      // If currently processing, stop it
      if (this.activePurchases.has(purchaseId)) {
        const purchaser = this.activePurchases.get(purchaseId);
        await purchaser.cancel();
        this.activePurchases.delete(purchaseId);
      }

      logger.info(`Purchase cancelled: ${purchaseId}`);
      return purchase;
      
    } catch (error) {
      logger.error('Error cancelling purchase:', error);
      throw error;
    }
  }

  // Cleanup old purchases
  cleanup() {
    // This would clean up old completed purchases from memory
    // Database cleanup should be handled separately
    logger.info('Purchase Manager cleanup completed');
  }

  // Get manager status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activePurchases: this.activePurchases.size,
      maxConcurrentPurchases: this.maxConcurrentPurchases,
      availablePurchasers: Object.keys(this.purchasers),
      cronJobs: this.cronJobs.length
    };
  }
}

module.exports = PurchaseManager;