const mongoose = require('mongoose')
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true
  },
  phone: { type: String, unique: true, sparse: true },
  password: { type: String, select: false },
  googleId: String,
  avatar: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  role: {
    type: String,
    enum: ['buyer', 'seller', 'admin']
  },
  isVerified: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  fcmToken: String,
  language: { type: String, default: 'en' },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  location: {
    latitude: Number,
    longitude: Number,
    city: String,
    state: String,
    country: String,
    fullAddress: String
  },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  lastLogin: Date,
  privacySettings: {
    marketingConsent: { type: Boolean, default: false },
    dataProcessingConsent: { type: Boolean, default: false },
    analyticsConsent: { type: Boolean, default: false }
  },
  consentLogs: [{
    consentType: { type: String, required: true },
    status: { type: Boolean, required: true },
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String
  }],
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date
}, { timestamps: true })

userSchema.index({ email: 1, isDeleted: 1 })
userSchema.index({ phone: 1, isDeleted: 1 })
userSchema.index({ role: 1 })
userSchema.index({ createdAt: -1 })

module.exports = mongoose.model('User', userSchema)