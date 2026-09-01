const mongoose = require('mongoose')

const crmSupportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true
  },
  subject: { type: String, required: true, trim: true },
  description: String,
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },
  requesterName: String,
  requesterEmail: String,
  requesterPhone: String,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff'
  },
  category: {
    type: String,
    enum: ['PAYMENT', 'ORDER', 'DELIVERY', 'PRODUCT', 'SELLER', 'ACCOUNT', 'REFUND', 'TECHNICAL', 'OTHER'],
    default: 'OTHER'
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  status: {
    type: String,
    enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
    default: 'OPEN'
  },
  slaDueDate: Date,
  messages: [{
    senderType: { type: String, enum: ['CUSTOMER', 'SELLER', 'STAFF', 'SYSTEM'] },
    senderName: String,
    senderId: mongoose.Schema.Types.ObjectId,
    message: String,
    attachments: [String],
    isInternal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  resolvedAt: Date,
  closedAt: Date
}, { timestamps: true })

crmSupportTicketSchema.pre('save', async function(next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model('CRMSupportTicket').countDocuments()
    this.ticketNumber = `TICK-${Date.now().toString().slice(-6)}-${count + 1}`
  }
  next()
})

crmSupportTicketSchema.index({ status: 1, priority: 1 })
crmSupportTicketSchema.index({ assignedTo: 1 })
crmSupportTicketSchema.index({ customer: 1 })
crmSupportTicketSchema.index({ seller: 1 })

module.exports = mongoose.model('CRMSupportTicket', crmSupportTicketSchema)
