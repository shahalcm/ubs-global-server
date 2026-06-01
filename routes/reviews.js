const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const reviewController = require('../controllers/reviewController')

// Public routes
router.get('/product/:productId', reviewController.getProductReviews)

// Protected routes (authenticated buyers only)
router.post('/', protect, reviewController.addReview)

module.exports = router