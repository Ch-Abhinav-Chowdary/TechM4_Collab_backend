const mongoose = require('mongoose');

const WorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  triggerEvent: {
    type: String,
    required: true,
    enum: [
      'task.completed', 
      'task.created', 
      'task.assigned', 
      'task.overdue',
      'file.uploaded',
      'file.modified',
      'user.joined',
      'user.levelup',
      'message.sent',
      'workflow.executed'
    ],
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create.task', 
      'send.email', 
      'send.notification', 
      'update.status',
      'send.slack',
      'send.discord',
      'create.file',
      'move.file',
      'archive.task',
      'assign.task',
      'award.points',
      'create.reminder',
      'send.webhook'
    ],
  },
  actionParams: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  conditions: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  isEnabled: {
    type: Boolean,
    default: true,
  },
  runOnce: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastExecuted: {
    type: Date,
  },
  executionCount: {
    type: Number,
    default: 0,
  },
  priority: {
    type: Number,
    default: 1,
  },
  tags: [{
    type: String,
    trim: true,
  }],
}, { timestamps: true });

module.exports = mongoose.model('Workflow', WorkflowSchema); 