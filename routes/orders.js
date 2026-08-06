const express = require('express')
const router = express.Router()
const orderController = require('../controllers/orderController')
const { protect } = require('../middleware/auth')

// Serviceability
router.post('/check-serviceability', protect, orderController.checkShippingServiceability)

// Buyer & Order management
router.post('/', protect, orderController.placeOrder)
router.get('/my-orders', protect, orderController.getMyOrders)
router.get('/seller-orders', protect, orderController.getSellerOrders)
router.patch('/:id/status', protect, orderController.updateOrderStatus)
router.get('/:id/track', protect, orderController.trackOrder)
router.post('/:id/cancel', protect, orderController.cancelOrder)

// Shiprocket manual triggers & document downloads
router.post('/:id/assign-awb', protect, orderController.assignAWB)
router.post('/:id/generate-pickup', protect, orderController.generatePickup)
router.post('/:id/generate-manifest', protect, orderController.generateManifest)
router.post('/:id/generate-label', protect, orderController.generateLabel)
router.post('/:id/generate-invoice', protect, orderController.generateInvoice)
router.get('/:id/view-invoice', orderController.viewInvoice)
router.get('/:id/view-label', orderController.viewLabel)

module.exports = router