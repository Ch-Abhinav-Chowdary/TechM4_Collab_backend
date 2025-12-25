const Activity = require('../models/Activity');

/**
 * Cleanup service to automatically delete activities older than 1 week
 * Runs daily at midnight (or on server start and then every 24 hours)
 */
class ActivityCleanupService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Delete activities older than 7 days
   */
  async cleanupOldActivities() {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      // Delete activities where timestamp is older than 1 week
      const result = await Activity.deleteMany({
        timestamp: { $lt: oneWeekAgo }
      });

      if (result.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${result.deletedCount} activities older than 1 week`);
      } else {
        console.log('🧹 No old activities to clean up');
      }

      return {
        success: true,
        deletedCount: result.deletedCount,
        cutoffDate: oneWeekAgo
      };
    } catch (error) {
      console.error('❌ Error cleaning up old activities:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start the cleanup service
   * Runs cleanup immediately on start, then schedules it to run daily at midnight
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Activity cleanup service is already running');
      return;
    }

    console.log('🔄 Starting activity cleanup service...');
    
    // Run cleanup immediately on start (async, don't wait)
    this.cleanupOldActivities().catch(err => {
      console.error('Error in initial cleanup:', err);
    });

    // Calculate milliseconds until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // Schedule first run at midnight, then repeat every 24 hours
    setTimeout(() => {
      this.cleanupOldActivities().catch(err => {
        console.error('Error in scheduled cleanup:', err);
      });
      
      // Then run every 24 hours (86400000 ms)
      this.intervalId = setInterval(() => {
        this.cleanupOldActivities().catch(err => {
          console.error('Error in periodic cleanup:', err);
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
      
      this.isRunning = true;
      console.log('✅ Activity cleanup service scheduled to run daily at midnight');
    }, msUntilMidnight);
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('🛑 Activity cleanup service stopped');
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? 'Daily at midnight' : 'Not scheduled'
    };
  }
}

// Export singleton instance
const activityCleanupService = new ActivityCleanupService();
module.exports = activityCleanupService;

