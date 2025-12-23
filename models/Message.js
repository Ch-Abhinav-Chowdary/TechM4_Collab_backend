const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: String, required: true },
  text: { type: String, trim: true },
  fileUrl: { type: String, trim: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
