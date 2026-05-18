const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')

router.post('/send-otp', authController.sendOTP)
router.post('/verify-otp', authController.verifyOTP)
router.post('/signup', authController.signup)
router.post('/login', authController.login)
router.post('/google/mobile', authController.googleMobileAuth)
router.post('/admin/login', authController.adminLogin)

module.exports = router