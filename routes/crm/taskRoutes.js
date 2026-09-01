const express = require('express')
const router = express.Router()
const { getTasks, createTask, updateTask, deleteTask } = require('../../controllers/crm/crmTaskController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getTasks)
router.post('/', protectCRM, createTask)
router.patch('/:id', protectCRM, updateTask)
router.delete('/:id', protectCRM, deleteTask)

module.exports = router
