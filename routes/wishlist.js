const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const { getWishlist, toggleWishlist } = require('../controllers/wishlistController')

router.get('/', protect, getWishlist)
router.post('/toggle/:productId', protect, toggleWishlist)

module.exports = router
