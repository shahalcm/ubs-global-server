const express = require('express')
const router = express.Router()
const { getCallHistory } = require('../../controllers/crm/crmCallController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getCallHistory)

module.exports = router
