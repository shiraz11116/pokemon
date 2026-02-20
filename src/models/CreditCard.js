const mongoose = require('mongoose');
const crypto = require('crypto-js');

const creditCardSchema = new mongoose.Schema({
  cardName: {
    type: String,
    required: true,
    trim: true
  },
  // Encrypted card details
  encryptedCardNumber: {
    type: String,
    required: true
  },
  encryptedCVV: {
    type: String,
    required: true
  },
  expiryMonth: {
    type: String,
    required: true,
    match: /^(0[1-9]|1[0-2])$/
  },
  expiryYear: {
    type: String,
    required: true,
    match: /^20[2-9][0-9]$/
  },
  cardholderName: {
    type: String,
    required: true,
    trim: true
  },
  billingAddress: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'US'
    }
  },
  cardType: {
    type: String,
    enum: ['visa', 'mastercard', 'amex', 'discover'],
    required: true
  },
  websites: [{
    type: String,
    enum: ['target', 'bestbuy', 'walmart', 'samsclub', 'gamestop', 'costco', 'pokemoncenter']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  usageStats: {
    totalPurchases: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Encrypt sensitive data before saving
creditCardSchema.pre('save', function(next) {
  if (this.isModified('encryptedCardNumber') || this.isModified('encryptedCVV')) {
    // Data should already be encrypted when passed to this model
    // This is just a safety check
  }
  next();
});

// Static methods for encryption/decryption
creditCardSchema.statics.encryptCardData = function(data) {
  const key = process.env.ENCRYPTION_KEY;
  return crypto.AES.encrypt(data, key).toString();
};

creditCardSchema.statics.decryptCardData = function(encryptedData) {
  const key = process.env.ENCRYPTION_KEY;
  const bytes = crypto.AES.decrypt(encryptedData, key);
  return bytes.toString(crypto.enc.Utf8);
};

// Method to get masked card number
creditCardSchema.methods.getMaskedCardNumber = function() {
  const decrypted = this.constructor.decryptCardData(this.encryptedCardNumber);
  return '**** **** **** ' + decrypted.slice(-4);
};

// Remove sensitive data from JSON output
creditCardSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.encryptedCardNumber;
  delete obj.encryptedCVV;
  obj.maskedCardNumber = this.getMaskedCardNumber();
  return obj;
};

module.exports = mongoose.model('CreditCard', creditCardSchema);