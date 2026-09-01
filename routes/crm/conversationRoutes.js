const express = require('express')
const router = express.Router()
const { getConversations, getConversationMessages, sendStaffMessage } = require('../../controllers/crm/crmConversationController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getConversations)
router.get('/:id/messages', protectCRM, getConversationMessages)
router.post('/:id/messages', protectCRM, sendStaffMessage)

module.exports = router
