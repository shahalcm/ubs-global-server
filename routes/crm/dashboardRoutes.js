const express = require('express')
const router = express.Router()
const { getDashboardStats } = require('../../controllers/crm/crmDashboardController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getDashboardStats)

module.exports = router
