const express = require('express')
const router = express.Router()
const { getLiveExchangeRates, detectLocation, updatePreferences } = require('../controllers/currencyController')
const { protect } = require('../middleware/auth')

router.get('/rates', getLiveExchangeRates)
router.get('/detect-location', detectLocation)
router.post('/preferences', updatePreferences)

module.exports = router
