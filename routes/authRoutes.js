const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const { authMiddleware, isAdmin } = require('../middleware/authMiddleware');

// Register
router.post('/register', authController.register);
// Login
router.post('/login', authController.login);
// Get current user
router.get('/me', authMiddleware, authController.getMe);
// Update profile
router.put('/profile', authMiddleware, authController.updateProfile);
// Get all users (for assigning tasks)
router.get('/users', authMiddleware, authController.getAllUsers);
// Admin: update user role
router.put('/user/:id/role', authMiddleware, isAdmin, authController.updateUserRole);
// Admin: delete user
router.delete('/user/:id', authMiddleware, isAdmin, authController.deleteUser);
// Admin: invite user by email
router.post('/invite', authMiddleware, isAdmin, authController.inviteUserByEmail);
// Leaderboard: top 10 users by points
router.get('/leaderboard', authController.getLeaderboard);

// Get user statistics
router.get('/user/stats', authMiddleware, userController.getUserStats);

module.exports = router;
