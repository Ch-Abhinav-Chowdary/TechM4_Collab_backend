require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const socketSetup = require('./socket');

// Import routes
const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutes');
const taskRoutes = require('./routes/taskRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const fileRoutes = require('./routes/fileRoutes');
const activityRoutes = require('./routes/activityRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Initialize app and server
const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Initialize activity cleanup service
const activityCleanupService = require('./services/activityCleanup');

// CORS setup - Allow multiple origins for production and development
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://tech-m4-collab-frontend-aghx.vercel.app',
  'https://tech-m4-collab-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins for easier testing
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, only allow specific origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Middleware
app.use(express.json());

// Test route to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!', timestamp: new Date().toISOString() });
});

// Serve static files from the "uploads" directory
app.use('/uploads', express.static('uploads'));

// Debug: Log all API requests
app.use('/api', (req, res, next) => {
  console.log(`📥 API Request: ${req.method} ${req.url}`);
  console.log(`🔍 Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/admin', adminRoutes);

// Root route - API status
app.get('/', (req, res) => {
  res.json({
    message: 'Real-Time Collaboration API Server',
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      test: '/api/test',
      auth: '/api/auth',
      messages: '/api/messages',
      tasks: '/api/tasks',
      files: '/api/files',
      activities: '/api/activities',
      workflows: '/api/workflows',
      admin: '/api/admin',
      upload: '/api/upload'
    },
    socket: {
      enabled: true,
      path: '/socket.io'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Catch-all route for debugging (404 handler)
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    message: 'Route not found', 
    method: req.method, 
    url: req.originalUrl,
    availableRoutes: [
      'GET /api/test',
      'GET /api/files/test',
      'POST /api/files',
      'GET /api/files/room/:room',
      'GET /api/activities',
      'GET /api/activities/stats'
    ]
  });
});

// WebSocket setup
const io = socketSetup(server);

// Set up admin controller to access online users count
const adminController = require('./controllers/adminController');
adminController.setOnlineUsersGetter(() => {
  return io.getOnlineUsersCount ? io.getOnlineUsersCount() : 0;
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 File API available at: http://localhost:${PORT}/api/files`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`📊 Activity API available at: http://localhost:${PORT}/api/activities`);
  
  // Start activity cleanup service after server starts
  // This ensures database connection is established
  setTimeout(() => {
    activityCleanupService.start();
  }, 5000); // Wait 5 seconds for DB connection to be ready
});
