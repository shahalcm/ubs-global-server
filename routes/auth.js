const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { protect } = require('../middleware/auth')

router.post('/send-otp', authController.sendOTP)
router.post('/verify-otp', authController.verifyOTP)
router.post('/signup', authController.signup)
router.post('/login', authController.login)
router.post('/forgot-password', authController.forgotPassword)
router.post('/reset-password-otp', authController.resetPasswordOtp)
router.post('/google/mobile', authController.googleMobileAuth)
router.post('/admin/login', authController.adminLogin)
router.patch('/set-role', protect, authController.setRole)

module.exports = router