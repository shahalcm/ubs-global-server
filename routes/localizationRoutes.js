const express = require('express')
const router = express.Router()
const localizationController = require('../controllers/localizationController')
const { adminProtect } = require('../middleware/adminAuth')

router.get('/languages', localizationController.getLanguages)
router.put('/languages/:code', adminProtect, localizationController.toggleLanguage)
router.get('/progress', adminProtect, localizationController.getProgress)
router.get('/missing', adminProtect, localizationController.getMissingReport)
router.get('/analytics', adminProtect, localizationController.getAnalytics)
router.post('/auto-translate', adminProtect, localizationController.autoTranslateContent)

module.exports = router
