const express = require('express')
const router = express.Router()
const { getTeamMembers, createTeamMember, updateTeamMember } = require('../../controllers/crm/crmTeamController')
const { protectCRM, requireRole } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getTeamMembers)
router.post('/', protectCRM, requireRole('SUPER_ADMIN', 'CRM_MANAGER'), createTeamMember)
router.patch('/:id', protectCRM, requireRole('SUPER_ADMIN', 'CRM_MANAGER'), updateTeamMember)

module.exports = router
