const mongoose = require('mongoose')

const crmActivitySchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ['Customer', 'Seller', 'Lead', 'SupportTicket', 'System'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  action: { type: String, required: true }, // e.g. "STATUS_CHANGE", "ORDER_PLACED", "NOTE_ADDED", "CALL_LOGGED"
  description: { type: String, required: true },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff'
  },
  performedByName: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true })

crmActivitySchema.index({ entityType: 1, entityId: 1, createdAt: -1 })

module.exports = mongoose.model('CRMActivity', crmActivitySchema)
