const mongoose = require('mongoose')

const crmNoteSchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ['Customer', 'Seller', 'Lead', 'SupportTicket'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff',
    required: true
  },
  content: { type: String, required: true },
  tags: [String],
  isImportant: { type: Boolean, default: false }
}, { timestamps: true })

crmNoteSchema.index({ entityType: 1, entityId: 1 })

module.exports = mongoose.model('CRMNote', crmNoteSchema)
