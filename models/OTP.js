const mongoose = require('mongoose')
const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 60 * 1000)
  },
  isUsed: { type: Boolean, default: false },
}, { timestamps: true })
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
module.exports = mongoose.model('OTP', otpSchema)