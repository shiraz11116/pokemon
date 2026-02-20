const nodemailer = require('nodemailer');
const logger = require('./logger');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Send purchase success email
  async sendPurchaseSuccess(userEmail, purchaseData) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: userEmail,
        subject: '🎉 Pokemon Card Purchase Successful!',
        html: `
          <h2>Purchase Successful!</h2>
          <p><strong>Product:</strong> ${purchaseData.productName}</p>
          <p><strong>Price:</strong> $${purchaseData.price}</p>
          <p><strong>Quantity:</strong> ${purchaseData.quantity}</p>
          <p><strong>Website:</strong> ${purchaseData.website}</p>
          <p><strong>Order ID:</strong> ${purchaseData.orderId || 'N/A'}</p>
          <p><strong>Total Amount:</strong> $${purchaseData.totalAmount}</p>
          <hr>
          <p>Your Pokemon card has been successfully purchased!</p>
          <small>This is an automated email from Pokemon Card Auto Buyer System</small>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Purchase success email sent to ${userEmail}`);
    } catch (error) {
      logger.error('Error sending purchase success email:', error);
    }
  }

  // Send purchase failure email
  async sendPurchaseFailure(userEmail, purchaseData, errorMessage) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: userEmail,
        subject: '❌ Pokemon Card Purchase Failed',
        html: `
          <h2>Purchase Failed</h2>
          <p><strong>Product:</strong> ${purchaseData.productName}</p>
          <p><strong>Website:</strong> ${purchaseData.website}</p>
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p><strong>Attempt:</strong> ${purchaseData.attemptNumber} of ${purchaseData.maxAttempts}</p>
          <hr>
          <p>We'll keep trying to purchase this item for you.</p>
          <p>Check your dashboard for more details.</p>
          <small>This is an automated email from Pokemon Card Auto Buyer System</small>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Purchase failure email sent to ${userEmail}`);
    } catch (error) {
      logger.error('Error sending purchase failure email:', error);
    }
  }

  // Send price alert email
  async sendPriceAlert(userEmail, skuData, priceData) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: userEmail,
        subject: '💰 Price Alert: Pokemon Card Price Drop!',
        html: `
          <h2>Price Alert!</h2>
          <p><strong>Product:</strong> ${skuData.name}</p>
          <p><strong>Current Price:</strong> $${priceData.currentPrice}</p>
          <p><strong>Target Price:</strong> $${skuData.targetPrice}</p>
          <p><strong>Savings:</strong> $${(skuData.targetPrice - priceData.currentPrice).toFixed(2)}</p>
          <p><strong>Website:</strong> ${priceData.website}</p>
          <p><strong>Availability:</strong> ${priceData.inStock ? 'In Stock' : 'Out of Stock'}</p>
          <hr>
          <p>The price has dropped below your target! ${skuData.purchaseSettings.autoPurchase ? 'We\'re attempting to purchase it now.' : 'Login to your dashboard to purchase.'}</p>
          <small>This is an automated email from Pokemon Card Auto Buyer System</small>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Price alert email sent to ${userEmail}`);
    } catch (error) {
      logger.error('Error sending price alert email:', error);
    }
  }

  // Send system error email
  async sendSystemError(adminEmail, errorData) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: adminEmail,
        subject: '🚨 System Error - Pokemon Card Auto Buyer',
        html: `
          <h2>System Error Alert</h2>
          <p><strong>Error Type:</strong> ${errorData.type}</p>
          <p><strong>Message:</strong> ${errorData.message}</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Component:</strong> ${errorData.component}</p>
          <hr>
          <pre>${errorData.stack}</pre>
          <small>This is an automated email from Pokemon Card Auto Buyer System</small>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`System error email sent to ${adminEmail}`);
    } catch (error) {
      logger.error('Error sending system error email:', error);
    }
  }

  // Test email configuration
  async testEmailConfig() {
    try {
      await this.transporter.verify();
      logger.info('Email configuration is valid');
      return true;
    } catch (error) {
      logger.error('Email configuration error:', error);
      return false;
    }
  }
}

module.exports = new EmailService();