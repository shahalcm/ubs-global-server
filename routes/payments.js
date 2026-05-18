const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const { adminProtect } = require('../middleware/adminAuth')
const { sellerProtect } = require('../middleware/sellerAuth')
const {
  createRazorpayOrder,
  verifyPayment,
  getPaymentHistory,
  sellerWithdrawal,
  adminWithdrawal,
  getSellerEarnings,
  getAdminCommissions
} = require('../controllers/paymentController')

// Buyer
router.post('/create-order', protect, createRazorpayOrder)
router.post('/verify', protect, verifyPayment)
router.get('/history', protect, getPaymentHistory)

// Seller
router.get(
  '/seller/earnings',
  protect,
  sellerProtect,
  getSellerEarnings
)
router.post(
  '/seller/withdraw',
  protect,
  sellerProtect,
  sellerWithdrawal
)

// Admin
router.get(
  '/admin/commissions',
  adminProtect,
  getAdminCommissions
)
router.post(
  '/admin/withdraw',
  adminProtect,
  adminWithdrawal
)

module.exports = router