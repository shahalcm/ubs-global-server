const mongoose = require('mongoose')

const pricingAuditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminName: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  target: {
    type: String,
    required: true,
    trim: true
  },
  fieldChanged: {
    type: String,
    trim: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String,
    trim: true
  }
}, { timestamps: true })

pricingAuditLogSchema.index({ adminId: 1 })
pricingAuditLogSchema.index({ action: 1 })
pricingAuditLogSchema.index({ createdAt: -1 })

module.exports = mongoose.model('PricingAuditLog', pricingAuditLogSchema)
