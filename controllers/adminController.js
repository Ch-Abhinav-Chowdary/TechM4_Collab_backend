const Task = require('../models/Task');
const User = require('../models/User');
const Activity = require('../models/Activity');
const mongoose = require('mongoose');
const os = require('os');

// Get online users count from socket
let getOnlineUsersCount = () => 0;

// Function to set the online users getter (called from socket.js)
exports.setOnlineUsersGetter = (getter) => {
  getOnlineUsersCount = getter;
};

// Get admin dashboard stats
exports.getAdminStats = async (req, res) => {
  try {
    // Get active tasks (non-completed)
    const activeTasks = await Task.countDocuments({ status: { $ne: 'Done' } });
    
    // Get online users count
    const onlineUsers = getOnlineUsersCount();
    
    // Calculate system health
    let systemHealth = 100;
    
    try {
      // Check database connectivity
      const dbState = mongoose.connection.readyState;
      if (dbState !== 1) { // 1 = connected
        systemHealth -= 30;
      }
      
      // Check memory usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memUsagePercent = (usedMem / totalMem) * 100;
      
      if (memUsagePercent > 90) {
        systemHealth -= 20;
      } else if (memUsagePercent > 75) {
        systemHealth -= 10;
      }
      
      // Check CPU load (simplified)
      const loadAvg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const cpuUsagePercent = (loadAvg / cpuCount) * 100;
      
      if (cpuUsagePercent > 90) {
        systemHealth -= 20;
      } else if (cpuUsagePercent > 75) {
        systemHealth -= 10;
      }
      
      // Ensure health is between 0 and 100
      systemHealth = Math.max(0, Math.min(100, systemHealth));
    } catch (error) {
      console.error('Error calculating system health:', error);
      systemHealth = 50; // Default to 50% if calculation fails
    }
    
    res.json({
      onlineUsers,
      activeTasks,
      systemHealth: Math.round(systemHealth)
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
};

// Get recent activities for admin dashboard
exports.getRecentActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const activities = await Activity.find()
      .populate('user', 'name email')
      .sort({ timestamp: -1 })
      .limit(limit);
    
    // Format activities for display
    const formattedActivities = activities.map(activity => {
      const timeAgo = getTimeAgo(activity.timestamp);
      return {
        type: activity.type,
        user: activity.user?.name || 'System',
        action: activity.message,
        time: timeAgo,
        icon: getActivityIcon(activity.type)
      };
    });
    
    res.json(formattedActivities);
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ error: 'Failed to fetch recent activities' });
  }
};

// Helper function to get time ago
function getTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds} sec ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hour ago`;
  return `${Math.floor(diffInSeconds / 86400)} day ago`;
}

// Helper function to get activity icon
function getActivityIcon(type) {
  const icons = {
    'task_created': '📝',
    'task_completed': '✅',
    'task_assigned': '👤',
    'user_joined_room': '👋',
    'user_left': '👋',
    'file_uploaded': '📁',
    'file_saved': '💾',
    'message_sent': '💬',
    'workflow_executed': '⚡',
    'user_levelup': '🎉'
  };
  return icons[type] || '📢';
}

