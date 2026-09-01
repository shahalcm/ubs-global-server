const express = require('express')
const router = express.Router()
const { getSellers, getSeller360, updateSellerStatus } = require('../../controllers/crm/crmSellerController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getSellers)
router.get('/:id', protectCRM, getSeller360)
router.patch('/:id/status', protectCRM, updateSellerStatus)

module.exports = router
