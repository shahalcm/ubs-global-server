const mongoose = require('mongoose')

const crmTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  entityType: {
    type: String,
    enum: ['Customer', 'Seller', 'Lead', 'SupportTicket', 'General'],
    default: 'General'
  },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  entityName: String,
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
  dueDate: Date,
  status: {
    type: String,
    enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'TODO'
  },
  tags: [String],
  completedAt: Date
}, { timestamps: true })

crmTaskSchema.index({ assignedTo: 1, status: 1 })
crmTaskSchema.index({ dueDate: 1 })

module.exports = mongoose.model('CRMTask', crmTaskSchema)
