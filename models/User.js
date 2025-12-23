const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'member', 'viewer'], default: 'member' },
  points: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: { type: [String], default: [] },
  lastActive: { type: Date },
  streak: { type: Number, default: 0 },
  online: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
