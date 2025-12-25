const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Register a new user (DEPRECATED - Only admin can create employees now)
// This endpoint is kept for backward compatibility but should not be used
exports.register = async (req, res) => {
  return res.status(403).json({ 
    error: 'Public registration is disabled. Only administrators can create new employees.' 
  });
};

// Admin: Create a new employee
exports.createEmployee = async (req, res) => {
  const { name, email, password, role, memberRole } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (!role || !['admin', 'member', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Valid role is required (admin, member, or viewer)' });
  }

  try {
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      name, 
      email, 
      password: hash, 
      role, 
      memberRole: memberRole || null 
    });

    // Return user without password and without token (admin creates, employee logs in)
    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      memberRole: user.memberRole,
      points: user.points,
      level: user.level,
      badges: user.badges,
      streak: user.streak,
      lastActive: user.lastActive,
    };

    res.status(201).json({
      message: 'Employee created successfully',
      user: safeUser,
    });
  } catch (err) {
    console.error('Create employee error:', err.message);
    res.status(500).json({ error: 'Server error while creating employee' });
  }
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Gamification: Daily login points and streak (non-viewers only)
    if (user.role !== 'viewer') {
      const today = new Date();
      const lastActive = user.lastActive ? new Date(user.lastActive) : null;
      const isNewDay = !lastActive || today.toDateString() !== lastActive.toDateString();
      if (isNewDay) {
        user.points += 5;
        // Streak logic
        if (lastActive && (today - lastActive) / (1000 * 60 * 60 * 24) === 1) {
          user.streak = (user.streak || 0) + 1;
        } else {
          user.streak = 1;
        }
        user.lastActive = today;
        // Level up
        if (user.points >= user.level * 100) {
          user.level += 1;
        }
        // Loyal user badge
        if (!user.badges.includes('loyal-user') && user.streak >= 7) {
          user.badges.push('loyal-user');
        }
        await user.save();
      }
    }

    // Set user online status on login
    user.online = true;
    user.lastActive = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      memberRole: user.memberRole,
      points: user.points,
      level: user.level,
      badges: user.badges,
      streak: user.streak,
      lastActive: user.lastActive,
      online: user.online,
    };
    res.json({
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('GetMe error:', err.message);
    res.status(500).json({ error: 'Error fetching user profile' });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  const { name, email, memberRole } = req.body;
  try {
    const updateData = { name, email };
    if (memberRole !== undefined) {
      updateData.memberRole = memberRole;
    }
    const updated = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) {
    console.error('Profile update failed:', err.message);
    res.status(500).json({ error: 'Server error while updating profile' });
  }
};

// Get all users (for assigning tasks)
exports.getAllUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role;
    }
    const users = await User.find(filter, 'name email role memberRole');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Admin: update user role
exports.updateUserRole = async (req, res) => {
  try {
    const { role, memberRole } = req.body;
    if (role && !['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent an admin from changing another admin's role
    if (role && targetUser.role === 'admin' && targetUser._id.toString() !== req.user.id) {
      return res.status(403).json({ error: "Cannot change another admin's role" });
    }

    if (role) {
      targetUser.role = role;
    }
    if (memberRole !== undefined) {
      targetUser.memberRole = memberRole;
    }
    await targetUser.save();
    
    res.json({ message: 'Role updated', user: targetUser });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
};

// Admin: delete user
exports.deleteUser = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting admin accounts
    if (targetUser.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be deleted' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Admin: invite user by email (mock)
exports.inviteUserByEmail = async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ error: 'Email and role required' });
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    // Generate a mock invite token
    const token = crypto.randomBytes(20).toString('hex');
    // In real app, send email with invite link
    const inviteLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/register?invite=${token}&email=${encodeURIComponent(email)}&role=${role}`;
    // Optionally, store invite in DB for validation
    res.json({ message: 'Invite link generated (mock)', inviteLink });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite user' });
  }
};

// Leaderboard: top 10 users by points (only members, exclude admins and viewers)
exports.getLeaderboard = async (req, res) => {
  try {
    const topUsers = await User.find({ role: 'member' }, 'name email points level badges')
      .sort({ points: -1 })
      .limit(10);
    res.json(topUsers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};
