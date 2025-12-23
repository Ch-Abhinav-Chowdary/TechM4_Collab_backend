const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const { authMiddleware } = require('../middleware/authMiddleware');

// Get recent activities
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const activities = await Activity.find()
      .populate('user', 'name email avatar')
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(activities);
  } catch (err) {
    console.error('❌ Error fetching activities:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Get activities by type
router.get('/type/:type', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const activities = await Activity.find({ type: req.params.type })
      .populate('user', 'name email avatar')
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(activities);
  } catch (err) {
    console.error('❌ Error fetching activities by type:', err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Get user's activities
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const activities = await Activity.find({ user: req.params.userId })
      .populate('user', 'name email avatar')
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(activities);
  } catch (err) {
    console.error('❌ Error fetching user activities:', err);
    res.status(500).json({ error: 'Failed to fetch user activities' });
  }
});

// Get activity statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await Activity.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalActivities = await Activity.countDocuments();
    const todayActivities = await Activity.countDocuments({
      timestamp: { $gte: new Date().setHours(0, 0, 0, 0) }
    });

    res.json({
      totalActivities,
      todayActivities,
      byType: stats
    });
  } catch (err) {
    console.error('❌ Error fetching activity stats:', err);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
});

module.exports = router; 