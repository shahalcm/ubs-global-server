const express = require('express')
const router = express.Router()
const localizationController = require('../controllers/localizationController')
const { protect, admin } = require('../middleware/auth')

router.get('/languages', localizationController.getLanguages)
router.put('/languages/:code', protect, admin, localizationController.toggleLanguage)
router.get('/progress', protect, admin, localizationController.getProgress)
router.get('/missing', protect, admin, localizationController.getMissingReport)
router.get('/analytics', protect, admin, localizationController.getAnalytics)

module.exports = router
