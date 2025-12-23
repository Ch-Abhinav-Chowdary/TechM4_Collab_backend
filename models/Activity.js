const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'user_joined_room',
      'user_left',
      'user_joined_file',
      'file_saved',
      'message_sent',
      'task_created',
      'task_completed',
      'task_assigned',
      'file_uploaded',
      'user_levelup',
      'workflow_executed'
    ]
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  room: {
    type: String,
    required: false
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for efficient querying
ActivitySchema.index({ timestamp: -1 });
ActivitySchema.index({ type: 1, timestamp: -1 });
ActivitySchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.model('Activity', ActivitySchema); 