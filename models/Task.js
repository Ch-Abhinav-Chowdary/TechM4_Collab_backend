const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Changed to array for multiple assignments
  status: { type: String, enum: ['To Do', 'In Progress', 'Done'], default: 'To Do' },
  dueDate: { type: Date },
  dependency: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  files: [{ type: String }],
  proofFiles: [{
    fileUrl: { type: String, required: true },
    fileName: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);
