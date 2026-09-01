const express = require('express')
const router = express.Router()
const { getAnalytics } = require('../../controllers/crm/crmAnalyticsController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getAnalytics)

module.exports = router
