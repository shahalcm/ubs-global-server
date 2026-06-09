const express = require('express');
const router = express.Router();
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const Seller = require('../models/Seller');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id });
    const orConditions = [
      { buyerId: req.user._id },
      { sellerId: req.user._id }
    ];
    if (seller) {
      orConditions.push({ sellerId: seller._id });
    }
    const rooms = await ChatRoom.find({
      $or: orConditions
    });
    const roomIds = rooms.map(r => r._id);
    const messages = await Message.find({ chatRoomId: { $in: roomIds }, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(50);
    const mapped = messages.map(m => ({
      ...m.toObject(),
      read: m.isRead
    }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;