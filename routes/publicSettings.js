const express = require('express')
const router = express.Router()
const SystemConfig = require('../models/SystemConfig')

// GET /api/public-settings
router.get('/', async (req, res) => {
  try {
    const config = await SystemConfig.findOne()
    if (!config) {
      return res.json({
        success: true,
        settings: {
          supportEmail: 'ops@ubs-global.com',
          contactPhone: '+1 (555) 098-7654'
        }
      })
    }
    // Only return the public settings fields for safety (don't leak API keys / payment secrets)
    res.json({
      success: true,
      settings: {
        supportEmail: config.supportEmail || 'ops@ubs-global.com',
        contactPhone: config.contactPhone || '+1 (555) 098-7654'
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

module.exports = router
