const mongoose = require('mongoose')

const crmLeadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  companyName: { type: String, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  country: { type: String, default: 'India' },
  type: {
    type: String,
    enum: ['BUYER', 'SELLER', 'BUSINESS', 'PARTNERSHIP'],
    default: 'BUYER'
  },
  status: {
    type: String,
    enum: ['NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'CONVERTED', 'NOT_INTERESTED', 'LOST'],
    default: 'NEW'
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  source: {
    type: String,
    enum: ['WEBSITE', 'MOBILE_APP', 'REFERRAL', 'CAMPAIGN', 'COLD_CALL', 'EVENT', 'OTHER'],
    default: 'WEBSITE'
  },
  estimatedValue: { type: Number, default: 0 },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff'
  },
  convertedEntity: {
    entityType: { type: String, enum: ['User', 'Seller'] },
    entityId: { type: mongoose.Schema.Types.ObjectId }
  },
  convertedAt: Date,
  lastContactedAt: Date,
  nextFollowUpAt: Date,
  notes: String
}, { timestamps: true })

crmLeadSchema.index({ status: 1 })
crmLeadSchema.index({ type: 1 })
crmLeadSchema.index({ assignedTo: 1 })
crmLeadSchema.index({ email: 1 })

module.exports = mongoose.model('CRMLead', crmLeadSchema)
