const mongoose = require('mongoose')

const botSessionSchema = new mongoose.Schema({

  chatRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },

  // Is bot currently active in this chat
  botActive: {
    type: Boolean,
    default: true
  },

  // Why bot was deactivated
  deactivatedReason: {
    type: String,
    enum: [
      'seller_takeover',
      'keyword_triggered',
      'buyer_request',
      'auto_takeover',
      'error'
    ]
  },

  // Message count in this session
  messageCount: {
    type: Number,
    default: 0
  },

  // Last bot reply timestamp
  lastBotReply: Date,

  // Conversation context for AI
  conversationHistory: [{
    role: {
      type: String,
      enum: ['user', 'assistant']
    },
    content: String,
    timestamp: Date
  }],

  // Product/seller context
  context: {
    productId: String,
    productName: String,
    productPrice: Number,
    productDescription: String,
    productImages: [String],
    sellerShopName: String,
    sellerDescription: String,
    sellerRating: Number
  }

}, { timestamps: true })

module.exports = mongoose.model(
  'BotSession',
  botSessionSchema
)
