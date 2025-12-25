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

// Admin: Manually trigger activity cleanup (for testing/admin use)
router.post('/cleanup', authMiddleware, async (req, res) => {
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can trigger cleanup' });
  }

  try {
    const activityCleanupService = require('../services/activityCleanup');
    const result = await activityCleanupService.cleanupOldActivities();
    res.json({
      message: 'Activity cleanup completed',
      ...result
    });
  } catch (err) {
    console.error('Error triggering cleanup:', err);
    res.status(500).json({ error: 'Failed to trigger cleanup' });
  }
});

// Admin: Get cleanup service status
router.get('/cleanup/status', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can view cleanup status' });
  }

  try {
    const activityCleanupService = require('../services/activityCleanup');
    const status = activityCleanupService.getStatus();
    res.json(status);
  } catch (err) {
    console.error('Error getting cleanup status:', err);
    res.status(500).json({ error: 'Failed to get cleanup status' });
  }
});

module.exports = router; 