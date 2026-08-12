const mongoose = require('mongoose')

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
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
  regionCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  countryCodes: [{
    type: String,
    uppercase: true,
    trim: true
  }],
  maxUses: {
    type: Number,
    default: 10000
  },
  usedCount: {
    type: Number,
    default: 0
  },
  maxUsesPerSeller: {
    type: Number,
    default: 1
  },
  startsAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true })

promoCodeSchema.index({ code: 1 })
promoCodeSchema.index({ regionCode: 1 })
promoCodeSchema.index({ isActive: 1 })

module.exports = mongoose.model('PromoCode', promoCodeSchema)
