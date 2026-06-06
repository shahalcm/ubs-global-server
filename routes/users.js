const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')
const { protect } = require('../middleware/auth')
const { avatarUpload } = require('../config/cloudinary')

// Profile routes
router.get('/profile', protect, userController.getProfile)
router.patch('/profile', protect, userController.updateProfile)
router.patch('/avatar', protect, avatarUpload.single('avatar'), userController.updateAvatar)
router.get('/location', protect, userController.getLocation)
router.put('/location', protect, userController.updateLocation)
router.patch('/change-password', protect, userController.changePassword)

// Account and GDPR routes
router.delete('/delete-account', protect, userController.deleteAccount)
router.get('/export-data', protect, userController.exportData)
router.delete('/delete-data', protect, userController.deleteDataRequest)
router.patch('/privacy-settings', protect, userController.updatePrivacySettings)

// Public legal doc routes
router.get('/legal-docs/:key', userController.getLegalDoc)

module.exports = router