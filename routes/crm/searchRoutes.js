const express = require('express')
const router = express.Router()
const { globalSearch } = require('../../controllers/crm/crmSearchController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, globalSearch)

module.exports = router
