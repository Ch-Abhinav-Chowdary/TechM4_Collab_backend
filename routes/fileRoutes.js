const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  getFilesByRoom,
  getFile,
  createFile,
  updateFile,
  deleteFile,
  addCollaborator,
  removeCollaborator
} = require('../controllers/fileController');

// Debug middleware for file routes
router.use((req, res, next) => {
  console.log(`📁 File route accessed: ${req.method} ${req.url}`);
  next();
});

// Test route to verify file routes are working
router.get('/test', (req, res) => {
  console.log('✅ File test route accessed');
  res.json({ message: 'File routes are working!', timestamp: new Date().toISOString() });
});

// Get all files for a room
router.get('/room/:room', authMiddleware, getFilesByRoom);

// Create a new file
router.post('/', authMiddleware, createFile);

// Get a single file
router.get('/:fileId', authMiddleware, getFile);

// Update file content
router.put('/:fileId', authMiddleware, updateFile);

// Delete a file
router.delete('/:fileId', authMiddleware, deleteFile);

// Add collaborator to file
router.post('/:fileId/collaborators', authMiddleware, addCollaborator);

// Remove collaborator from file
router.delete('/:fileId/collaborators/:userId', authMiddleware, removeCollaborator);

module.exports = router;