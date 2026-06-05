const mongoose = require('mongoose')
const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userType'
  },
  userType: {
    type: String,
    enum: ['User', 'Seller', 'Admin']
  },
  title: String,
  message: String,
  type: {
    type: String,
    enum: [
      'order','payment','message',
      'system','promotion','contact_request'
    ]
  },
  isRead: { type: Boolean, default: false },
  data: mongoose.Schema.Types.Mixed,
}, { timestamps: true })

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 })

module.exports = mongoose.model('Notification', notificationSchema)