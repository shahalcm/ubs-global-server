const mongoose = require('mongoose')

const sellerRegistrationOfferSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  countryCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  regionCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  baseAmount: {
    type: Number,
    required: true,
    default: 200
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
  discountAmount: {
    type: Number,
    required: true,
    default: 0
  },
  finalAmount: {
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
  promoCode: {
    type: String,
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAYMENT_PROCESSING', 'PAID', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
    uppercase: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true })

sellerRegistrationOfferSchema.index({ userId: 1 })
sellerRegistrationOfferSchema.index({ status: 1 })
sellerRegistrationOfferSchema.index({ expiresAt: 1 })
sellerRegistrationOfferSchema.index({ promoCode: 1 })

module.exports = mongoose.model('SellerRegistrationOffer', sellerRegistrationOfferSchema)
