const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminOnly } = require('../middleware/authMiddleware');

// Get admin dashboard stats (Admin only)
router.get('/stats', adminOnly, adminController.getAdminStats);

// Get recent activities for admin dashboard (Admin only)
router.get('/activities', adminOnly, adminController.getRecentActivities);

module.exports = router;

