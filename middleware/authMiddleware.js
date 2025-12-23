const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log('Auth middleware - headers:', {
    authorization: authHeader ? 'Bearer [TOKEN]' : 'Missing',
    method: req.method,
    url: req.url
  });

  // No token at all
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth failed: No token or malformed token');
    return res.status(401).json({ message: 'Authorization token missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('JWT decoded:', { id: decoded.id });
    
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      console.log('Auth failed: User not found for token');
      return res.status(401).json({ message: 'User not found for this token' });
    }
    
    console.log('Auth successful for user:', user.name);
    req.user = user; // Attach the full user object
    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminOnly = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    req.user = user; // Attach the full user object
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin check middleware
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

module.exports = { authMiddleware, isAdmin, adminOnly };
