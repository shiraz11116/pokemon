const mongoose = require('mongoose');

const skuSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['booster-pack', 'single-card', 'collection-box', 'elite-trainer-box', 'tin', 'other'],
    default: 'booster-pack'
  },
  targetPrice: {
    type: Number,
    required: true,
    min: 0
  },
  maxPrice: {
    type: Number,
    required: true,
    min: 0
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  websites: [{
    name: {
      type: String,
      enum: ['target', 'bestbuy', 'walmart', 'samsclub', 'gamestop', 'costco', 'pokemoncenter'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    selector: {
      price: String,
      availability: String,
      addToCart: String
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  purchaseSettings: {
    maxQuantity: {
      type: Number,
      default: 1,
      min: 1
    },
    autoPurchase: {
      type: Boolean,
      default: false
    },
    requireConfirmation: {
      type: Boolean,
      default: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'paused'],
    default: 'active'
  },
  metadata: {
    set: String,
    series: String,
    rarity: String,
    language: {
      type: String,
      default: 'English'
    },
    condition: {
      type: String,
      default: 'New'
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

// Indexes for better performance
skuSchema.index({ sku: 1 });
skuSchema.index({ priority: 1, status: 1 });
skuSchema.index({ 'websites.name': 1 });

module.exports = mongoose.model('SKU', skuSchema);