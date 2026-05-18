const express = require('express')
const router = express.Router()
const chatController = require('../controllers/chatController')
const { protect } = require('../middleware/auth')

router.get('/my-rooms', protect, chatController.getMyRooms)
router.get('/:roomId/messages', protect, chatController.getMessages)
router.post('/:roomId/messages', protect, chatController.sendMessage)
router.patch('/:roomId/read', protect, chatController.markRoomRead)

module.exports = router
