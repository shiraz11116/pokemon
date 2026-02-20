const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  sku: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SKU',
    required: true
  },
  website: {
    name: {
      type: String,
      enum: ['target', 'bestbuy', 'walmart', 'samsclub', 'gamestop', 'costco', 'pokemoncenter'],
      required: true
    },
    url: {
      type: String,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed', 'cancelled'],
    default: 'pending'
  },
  purchaseDetails: {
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    totalAmount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  orderInfo: {
    orderId: String,
    confirmationNumber: String,
    trackingNumber: String,
    estimatedDelivery: Date
  },
  attemptInfo: {
    attemptNumber: {
      type: Number,
      default: 1
    },
    lastAttempt: {
      type: Date,
      default: Date.now
    },
    maxAttempts: {
      type: Number,
      default: 3
    }
  },
  errors: [{
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    errorCode: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    }
  }],
  paymentInfo: {
    cardUsed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CreditCard'
    },
    transactionId: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'pending'
    }
  },
  notifications: {
    emailSent: {
      type: Boolean,
      default: false
    },
    emailTimestamp: Date,
    notificationType: {
      type: String,
      enum: ['success', 'failure', 'attempt']
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Calculate total amount before saving
purchaseSchema.pre('save', function(next) {
  if (this.purchaseDetails.price && this.purchaseDetails.quantity) {
    this.purchaseDetails.totalAmount = this.purchaseDetails.price * this.purchaseDetails.quantity;
  }
  next();
});

// Indexes
purchaseSchema.index({ status: 1, createdAt: -1 });
purchaseSchema.index({ sku: 1 });
purchaseSchema.index({ 'website.name': 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);