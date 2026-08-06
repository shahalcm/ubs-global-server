const currencyService = require('../services/currencyService')
const geoService = require('../services/geoService')
const User = require('../models/User')

/**
 * Get live exchange rates & currency metadata
 */
exports.getLiveExchangeRates = async (req, res) => {
  try {
    const rates = await currencyService.getExchangeRates()
    res.json({
      success: true,
      base: 'USD',
      rates,
      metadata: currencyService.CURRENCY_METADATA
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Detect location & currency metadata from IP / Coordinates
 */
exports.detectLocation = async (req, res) => {
  try {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    const geoInfo = await geoService.detectLocationFromIP(clientIP)

    res.json({
      success: true,
      location: geoInfo
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Update user currency, country, language, timezone preferences
 */
exports.updatePreferences = async (req, res) => {
  try {
    const { countryCode, countryName, currencyCode, currencySymbol, timezone, language, lat, lng } = req.body

    const updates = {}
    if (countryCode) updates.countryCode = countryCode.toUpperCase()
    if (countryName) updates.countryName = countryName
    if (currencyCode) updates.currencyCode = currencyCode.toUpperCase()
    if (currencySymbol) updates.currencySymbol = currencySymbol
    if (timezone) updates.timezone = timezone
    if (language) updates.language = language
    if (lat !== undefined) updates.lat = lat
    if (lng !== undefined) updates.lng = lng

    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, updates, { new: true })
    }

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: updates
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
