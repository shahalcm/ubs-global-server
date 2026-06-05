const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    productName: String,
    productImage: String,
    productSku: String,
    quantity: Number,
    price: Number,
    subtotal: Number
  }],
  // Pricing breakdown
  subtotal: Number,
  shippingFee: Number,
  tax: Number,
  grandTotal: Number,

  // Payment
  paymentMethod: {
    type: String,
    default: 'razorpay'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  paidAt: Date,

  // Commission
  commissionPercent: {
    type: Number,
    default: 3
  },
  commissionAmount: Number,
  sellerEarnings: Number,
  adminEarnings: Number,

  // Order status
  orderStatus: {
    type: String,
    enum: [
      'placed', 'confirmed', 'packed',
      'shipped', 'delivered',
      'cancelled', 'returned'
    ],
    default: 'placed'
  },

  // Delivery address
  deliveryAddress: {
    fullName: String,
    phone: String,
    email: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },

  // Tracking
  trackingNumber: String,
  courierName: String,
  estimatedDelivery: Date,
  deliveredAt: Date,

  // Timeline
  timeline: [{
    status: String,
    timestamp: Date,
    note: String
  }],

  // Bill/Invoice
  invoiceUrl: String,

}, { timestamps: true })

// Auto generate order number
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order')
      .countDocuments()
    this.orderNumber = `UBS-${Date.now()}-${count + 1}`
  }
  next()
})

orderSchema.index({ buyerId: 1 })
orderSchema.index({ sellerId: 1 })
orderSchema.index({ orderStatus: 1 })
orderSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Order', orderSchema)