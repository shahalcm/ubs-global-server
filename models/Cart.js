const mongoose = require('mongoose')

const cartSchema = new mongoose.Schema({
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller'
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    price: Number,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true })

module.exports = mongoose.model('Cart', cartSchema)
