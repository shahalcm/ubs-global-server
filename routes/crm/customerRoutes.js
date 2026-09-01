const express = require('express')
const router = express.Router()
const { getCustomers, getCustomer360, getCustomerActivity } = require('../../controllers/crm/crmCustomerController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getCustomers)
router.get('/:id', protectCRM, getCustomer360)
router.get('/:id/activity', protectCRM, getCustomerActivity)

module.exports = router
