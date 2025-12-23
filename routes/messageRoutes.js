const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Get all messages in a channel
router.get('/:channel', messageController.getChannelMessages);
// Send a new message (protected, if needed)
router.post('/', authMiddleware, messageController.sendMessage);

module.exports = router;
