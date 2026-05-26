const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const mapped = notifications.map(n => ({
      ...n.toObject(),
      read: n.isRead
    }));
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;