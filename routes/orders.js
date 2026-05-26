const express = require('express')
const router = express.Router()
const orderController = require('../controllers/orderController')
const { protect } = require('../middleware/auth')

router.post('/', protect, orderController.placeOrder)
router.get('/my-orders', protect, orderController.getMyOrders)
router.get('/seller-orders', protect, orderController.getSellerOrders)
router.patch('/:id/status', protect, orderController.updateOrderStatus)
router.get('/:id/track', protect, orderController.trackOrder)

module.exports = router