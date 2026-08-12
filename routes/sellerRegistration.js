const express = require('express')
const router = express.Router()
const sellerRegistrationController = require('../controllers/sellerRegistrationController')
const { protect } = require('../middleware/auth')

// Registration Pricing Offer Endpoints
router.get('/offer', protect, sellerRegistrationController.getRegistrationOffer)
router.post('/promo/validate', protect, sellerRegistrationController.validatePromoCode)
router.post('/create-payment', protect, sellerRegistrationController.createPayment)

module.exports = router
