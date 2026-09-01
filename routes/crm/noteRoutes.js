const express = require('express')
const router = express.Router()
const { getNotes, createNote, deleteNote } = require('../../controllers/crm/crmNoteController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.get('/', protectCRM, getNotes)
router.post('/', protectCRM, createNote)
router.delete('/:id', protectCRM, deleteNote)

module.exports = router
