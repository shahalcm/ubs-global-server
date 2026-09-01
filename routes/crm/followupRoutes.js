const express = require('express')
const router = express.Router()
const { getFollowUps, createFollowUp, updateFollowUp, deleteFollowUp } = require('../../controllers/crm/crmFollowUpController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getFollowUps)
router.post('/', protectCRM, createFollowUp)
router.patch('/:id', protectCRM, updateFollowUp)
router.delete('/:id', protectCRM, deleteFollowUp)

module.exports = router
