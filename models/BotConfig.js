const mongoose = require('mongoose')

const botConfigSchema = new mongoose.Schema({

  // Which seller this config belongs to
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },

  // Is bot enabled for this seller
  isEnabled: {
    type: Boolean,
    default: true
  },

  // Bot personality/name
  botName: {
    type: String,
    default: 'UBS Assistant'
  },
  botAvatar: String,

  // Custom instructions for this seller's bot
  customInstructions: String,

  // Keywords that trigger human takeover
  humanTakeoverKeywords: {
    type: [String],
    default: [
      'speak to human',
      'real person',
      'agent',
      'manager',
      'complaint',
      'refund',
      'cancel order'
    ]
  },

  // Auto takeover after X messages
  autoTakeoverAfter: {
    type: Number,
    default: 10
  },

  // Working hours (bot only works in these hours)
  workingHours: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '09:00' },
    end: { type: String, default: '18:00' },
    timezone: { type: String, default: 'UTC' }
  },

  // Quick reply buttons
  quickReplies: [{
    label: String,
    message: String
  }],

  // Welcome message
  welcomeMessage: {
    type: String,
    default: `Hello! 👋 I'm UBS Assistant. 
    I can help you with product info, 
    pricing, and shipping. How can I help you?`
  },

  // Offline message
  offlineMessage: {
    type: String,
    default: `We are currently offline. 
    Leave a message and we'll get back to you soon!`
  }

}, { timestamps: true })

module.exports = mongoose.model(
  'BotConfig',
  botConfigSchema
)
