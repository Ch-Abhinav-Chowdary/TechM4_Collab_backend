const User = require('../models/User');
const Task = require('../models/Task');
const Activity = require('../models/Activity');

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    // Get user with latest data
    const user = await User.findById(userId).select('points level badges streak lastActive');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get task statistics
    const totalTasks = await Task.countDocuments({ assignedTo: userId });
    const completedTasks = await Task.countDocuments({ 
      assignedTo: userId, 
      status: 'Done' 
    });
    const inProgressTasks = await Task.countDocuments({ 
      assignedTo: userId, 
      status: 'In Progress' 
    });
    const overdueTasks = await Task.countDocuments({
      assignedTo: userId,
      dueDate: { $lt: new Date() },
      status: { $ne: 'Done' }
    });

    // Get weekly progress (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const weeklyProgress = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const tasksCompleted = await Task.countDocuments({
        assignedTo: userId,
        status: 'Done',
        updatedAt: {
          $gte: date,
          $lt: nextDate
        }
      });
      
      weeklyProgress.push({
        date: date.toISOString().split('T')[0],
        completed: tasksCompleted
      });
    }

    // Calculate rank based on points
    const getRank = (points) => {
      if (points < 100) return 'Bronze';
      if (points < 500) return 'Silver';
      if (points < 1000) return 'Gold';
      if (points < 2000) return 'Platinum';
      return 'Diamond';
    };

    // Get user's rank in leaderboard (only among members)
    const userRank = await User.countDocuments({
      role: 'member',
      points: { $gt: user.points || 0 }
    }) + 1;

    // Get activity count
    const totalActivities = await Activity.countDocuments({ user: userId });
    const recentActivities = await Activity.countDocuments({
      user: userId,
      timestamp: { $gte: sevenDaysAgo }
    });

    res.json({
      tasksCompleted: completedTasks,
      totalTasks: totalTasks,
      inProgressTasks: inProgressTasks,
      overdueTasks: overdueTasks,
      streakDays: user.streak || 0,
      totalXP: user.points || 0,
      level: user.level || 1,
      badges: user.badges || [],
      badgesCount: (user.badges || []).length,
      rank: getRank(user.points || 0),
      leaderboardRank: userRank,
      weeklyProgress: weeklyProgress,
      totalActivities: totalActivities,
      recentActivities: recentActivities,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
};

