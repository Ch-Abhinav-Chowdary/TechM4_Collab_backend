const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  content: { 
    type: String, 
    default: '' 
  },
  fileType: { 
    type: String, 
    required: true,
    enum: ['text', 'markdown', 'javascript', 'python', 'html', 'css', 'json', 'xml', 'yaml', 'sql']
  },
  room: { 
    type: String, 
    required: true 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  lastModifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  version: { 
    type: Number, 
    default: 1 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  collaborators: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
  }],
  cursorPositions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    position: { type: Number, default: 0 },
    name: { type: String },
    color: { type: String }
  }]
}, { 
  timestamps: true 
});

// Index for efficient queries
FileSchema.index({ room: 1, isActive: 1 });
FileSchema.index({ createdBy: 1 });

module.exports = mongoose.model('File', FileSchema); 