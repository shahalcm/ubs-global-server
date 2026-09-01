const express = require('express')
const router = express.Router()
const { getLeads, createLead, getLeadById, updateLead, deleteLead } = require('../../controllers/crm/crmLeadController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getLeads)
router.post('/', protectCRM, createLead)
router.get('/:id', protectCRM, getLeadById)
router.patch('/:id', protectCRM, updateLead)
router.delete('/:id', protectCRM, deleteLead)

module.exports = router
