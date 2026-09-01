const mongoose = require('mongoose')

const crmFollowUpSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  entityType: {
    type: String,
    enum: ['Customer', 'Seller', 'Lead', 'SupportTicket'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityName: String,
  type: {
    type: String,
    enum: ['CALL', 'EMAIL', 'MEETING', 'DEMO', 'TASK', 'REVIEW'],
    default: 'CALL'
  },
  dueDate: { type: Date, required: true },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff'
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED'],
    default: 'PENDING'
  },
  completedAt: Date,
  completionNotes: String
}, { timestamps: true })

crmFollowUpSchema.index({ dueDate: 1, status: 1 })
crmFollowUpSchema.index({ assignedTo: 1 })
crmFollowUpSchema.index({ entityType: 1, entityId: 1 })

module.exports = mongoose.model('CRMFollowUp', crmFollowUpSchema)
