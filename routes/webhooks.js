const express = require('express')
const router = express.Router()
const webhookController = require('../controllers/webhookController')

// POST /api/webhooks/shiprocket
router.post('/shiprocket', webhookController.handleShiprocketWebhook)

module.exports = router
