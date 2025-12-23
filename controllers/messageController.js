const Message = require('../models/Message');
const User = require('../models/User');

// Send a new message
exports.sendMessage = async (req, res) => {
  try {
    const { channel, text, fileUrl } = req.body;
    if (!channel || !text) return res.status(400).json({ error: 'Channel and text are required' });
    const message = new Message({
      sender: req.user._id,
      channel,
      text,
      fileUrl,
    });
    await message.save();
    await message.populate('sender', 'name email');

    // Gamification: Award 1 point for sending a message
    const user = await User.findById(req.user.id);
    if (user && user.role !== 'viewer') {
      user.points += 1;
      if (user.points >= user.level * 100) {
        user.level += 1;
      }
      await user.save();
    }

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
};

// Get all messages in a channel
exports.getChannelMessages = async (req, res) => {
  try {
    const { channel } = req.params;
    const messages = await Message.find({ channel }).populate('sender', 'name email').sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
};
