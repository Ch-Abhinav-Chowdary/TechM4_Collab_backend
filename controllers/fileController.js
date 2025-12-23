const File = require('../models/File');
const User = require('../models/User');

// Get all files for a room
const getFilesByRoom = async (req, res) => {
  try {
    const { room } = req.params;
    const files = await File.find({ room, isActive: true })
      .populate('createdBy', 'name _id')
      .populate('lastModifiedBy', 'name _id')
      .populate('collaborators.user', 'name _id')
      .sort({ updatedAt: -1 });

    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a single file
const getFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findById(fileId)
      .populate('createdBy', 'name _id')
      .populate('lastModifiedBy', 'name _id')
      .populate('collaborators.user', 'name _id')
      .populate('cursorPositions.user', 'name _id');

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new file
const createFile = async (req, res) => {
  try {
    const { name, content, fileType, room } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'File name is required' });
    }

    if (!fileType) {
      return res.status(400).json({ message: 'File type is required' });
    }

    if (!room) {
      return res.status(400).json({ message: 'Room is required' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const file = new File({
      name: name.trim(),
      content: content || '',
      fileType,
      room,
      createdBy: userId,
      lastModifiedBy: userId,
      collaborators: [{ user: userId }]
    });

    await file.save();
    
    const populatedFile = await file.populate([
      { path: 'createdBy', select: 'name _id' },
      { path: 'lastModifiedBy', select: 'name _id' },
      { path: 'collaborators.user', select: 'name _id' }
    ]);

    res.status(201).json(populatedFile);
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update file content
const updateFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { content, version } = req.body;
    const userId = req.user._id;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Version conflict check
    if (file.version !== version) {
      return res.status(409).json({ 
        message: 'Version conflict', 
        currentVersion: file.version,
        currentContent: file.content,
        file: await file.populate([
          { path: 'createdBy', select: 'name _id' },
          { path: 'lastModifiedBy', select: 'name _id' },
          { path: 'collaborators.user', select: 'name _id' }
        ])
      });
    }

    file.content = content;
    file.version = version + 1;
    file.lastModifiedBy = userId;
    file.updatedAt = new Date();

    await file.save();
    
    const updatedFile = await file.populate([
      { path: 'createdBy', select: 'name _id' },
      { path: 'lastModifiedBy', select: 'name _id' },
      { path: 'collaborators.user', select: 'name _id' }
    ]);

    // Emit socket event to notify all users in the file
    const io = req.app.get('io');
    if (io) {
      io.to(fileId).emit('fileSaved', {
        fileId,
        version: file.version,
        savedBy: req.user,
        timestamp: Date.now(),
        file: updatedFile
      });
    }

    res.json(updatedFile);
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete a file
const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user is creator or has permission
    if (file.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this file' });
    }

    file.isActive = false;
    await file.save();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add collaborator to file
const addCollaborator = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req.body;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user is already a collaborator
    const existingCollaborator = file.collaborators.find(
      collab => collab.user.toString() === userId
    );

    if (!existingCollaborator) {
      file.collaborators.push({ user: userId });
      await file.save();
    }

    const updatedFile = await file.populate([
      { path: 'createdBy', select: 'name _id' },
      { path: 'lastModifiedBy', select: 'name _id' },
      { path: 'collaborators.user', select: 'name _id' }
    ]);

    res.json(updatedFile);
  } catch (error) {
    console.error('Error adding collaborator:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Remove collaborator from file
const removeCollaborator = async (req, res) => {
  try {
    const { fileId, userId } = req.params;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    file.collaborators = file.collaborators.filter(
      collab => collab.user.toString() !== userId
    );

    await file.save();

    const updatedFile = await file.populate([
      { path: 'createdBy', select: 'name _id' },
      { path: 'lastModifiedBy', select: 'name _id' },
      { path: 'collaborators.user', select: 'name _id' }
    ]);

    res.json(updatedFile);
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getFilesByRoom,
  getFile,
  createFile,
  updateFile,
  deleteFile,
  addCollaborator,
  removeCollaborator
}; 