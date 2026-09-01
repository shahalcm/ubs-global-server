const express = require('express')
const router = express.Router()
const { getTickets, createTicket, getTicketById, updateTicket } = require('../../controllers/crm/crmSupportController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getTickets)
router.post('/', protectCRM, createTicket)
router.get('/:id', protectCRM, getTicketById)
router.patch('/:id', protectCRM, updateTicket)

module.exports = router
