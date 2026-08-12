const mongoose = require('mongoose')

const regionalPricingRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  regionCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  countries: [{
    type: String,
    uppercase: true,
    trim: true
  }],
  baseAmount: {
    type: Number,
    required: true,
    default: 200
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    uppercase: true
  },
  discountType: {
    type: String,
    required: true,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  discountValue: {
    type: Number,
    required: true,
    default: 0
  },
  promoCodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PromoCode'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startsAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  }
}, { timestamps: true })

regionalPricingRuleSchema.index({ regionCode: 1 })
regionalPricingRuleSchema.index({ isActive: 1 })

module.exports = mongoose.model('RegionalPricingRule', regionalPricingRuleSchema)
