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
    priceUSD: Number,
    displayPrice: Number,
    subtotal: Number
  }],
  // Pricing breakdown (stored in USD base)
  subtotal: Number,
  shippingFee: Number,
  tax: Number,
  grandTotal: Number,

  // Multi-Currency & Geo Metadata
  buyerCurrency: { type: String, default: 'USD' },
  buyerCountry: { type: String, default: 'US' },
  exchangeRate: { type: Number, default: 1.0 },
  displaySubtotal: Number,
  displayShippingFee: Number,
  displayTax: Number,
  displayGrandTotal: Number,
  paymentCurrency: { type: String, default: 'USD' },
  paymentGateway: { type: String, default: 'stripe' },

  // Refunds
  refundAmount: Number,
  refundCurrency: String,
  refundExchangeRate: Number,
  refundedAt: Date,

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
  stripePaymentIntentId: String,
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
      'pickup_scheduled', 'picked_up',
      'shipped', 'in_transit', 'reached_origin_hub', 'reached_destination_hub',
      'out_for_delivery', 'delivered',
      'returned', 'cancelled', 'failed_delivery', 'lost', 'damaged'
    ],
    default: 'placed'
  },

  // Delivery address & instructions
  deliveryAddress: {
    fullName: String,
    phone: String,
    email: String,
    street: String,
    landmark: String,
    city: String,
    state: String,
    country: String,
    zipCode: String,
    deliveryInstructions: String
  },
  sellerNote: String,
  shippingSpeed: {
    type: String,
    default: 'standard'
  },

  // Tracking & Shiprocket External API Integration
  trackingNumber: String,
  courierName: String,
  courierCompanyId: Number,
  shiprocketOrderId: String,
  shiprocketShipmentId: String,
  awbCode: String,
  trackingUrl: String,
  shippingCharge: { type: Number, default: 0 },
  pickupStatus: { type: String, default: 'pending' },
  pickupScheduledDate: Date,
  pickupId: String,
  pickupTokenNumber: String,
  manifestUrl: String,
  labelUrl: String,
  invoiceUrl: String,
  expectedDeliveryDate: Date,
  deliveryDate: Date,
  currentShipmentStatus: { type: String, default: 'NEW' },
  currentTrackingStatus: { type: String, default: 'Order Created' },
  trackingEvents: [{
    activity: String,
    location: String,
    date: String,
    time: String,
    status: String,
    sr_status: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // Timeline
  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],
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
orderSchema.index({ shiprocketOrderId: 1 })
orderSchema.index({ shiprocketShipmentId: 1 })
orderSchema.index({ awbCode: 1 })
orderSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Order', orderSchema)