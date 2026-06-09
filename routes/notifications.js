const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const Seller = require('../models/Seller');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id });
    const userIds = [req.user._id];
    if (seller) {
      userIds.push(seller._id);
    }
    const notifications = await Notification.find({ userId: { $in: userIds } })
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

// Mark all as read
router.patch('/mark-all-read', protect, async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id });
    const userIds = [req.user._id];
    if (seller) {
      userIds.push(seller._id);
    }
    await Notification.updateMany(
      { userId: { $in: userIds }, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark single notification as read
router.patch('/:id/read', protect, async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id });
    const userIds = [req.user._id];
    if (seller) {
      userIds.push(seller._id);
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: { $in: userIds } },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, notification: { ...notification.toObject(), read: notification.isRead } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;