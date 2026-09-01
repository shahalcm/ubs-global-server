const mongoose = require('mongoose')

const crmAuditLogSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff',
    required: true
  },
  staffName: String,
  staffEmail: String,
  role: String,
  action: { type: String, required: true }, // e.g. "STAFF_LOGIN", "ROLE_UPDATED", "LEAD_DELETED", "CUSTOMER_EXPORTED"
  targetEntity: String,
  targetId: String,
  ipAddress: String,
  userAgent: String,
  details: mongoose.Schema.Types.Mixed
}, { timestamps: true })

crmAuditLogSchema.index({ staffId: 1, createdAt: -1 })
crmAuditLogSchema.index({ action: 1 })

module.exports = mongoose.model('CRMAuditLog', crmAuditLogSchema)
