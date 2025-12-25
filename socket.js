const { Server } = require('socket.io');
const Message = require('./models/Message');
const File = require('./models/File');
const Activity = require('./models/Activity');
const User = require('./models/User');

const onlineUsers = {};
const typingUsers = {};
const fileEditingUsers = {};
const fileCursors = {};

// Activity tracking function
const trackActivity = async (io, activityData) => {
  try {
    const activity = await Activity.create({
      ...activityData,
      timestamp: new Date()
    });

    // Populate user info
    await activity.populate('user', 'name email avatar');

    // Broadcast to all connected users
    io.emit('activity', {
      id: activity._id,
      type: activity.type,
      user: activity.user,
      data: activity.data,
      message: activity.message,
      timestamp: activity.timestamp,
      room: activity.room
    });

    console.log('✅ Activity broadcasted:', activity.message);
  } catch (error) {
    console.error('❌ Error tracking activity:', error);
  }
};

const socketSetup = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  // Track all connected users globally (not just by room)
  const globalOnlineUsers = new Map(); // socket.id -> user

  // Helper function to emit online users to all admins
  const emitOnlineUsersToAdmins = async (io, globalOnlineUsersMap) => {
    try {
      // Get all online users from database
      const onlineUsersFromDB = await User.find({ online: true })
        .select('name email role memberRole _id lastActive')
        .lean();
      
      // Emit to all connected sockets (admins will filter on frontend)
      io.emit('onlineUsersList', onlineUsersFromDB);
    } catch (error) {
      console.error('Error emitting online users to admins:', error);
    }
  };

  io.on('connection', async (socket) => {
    console.log('🟢 New user connected:', socket.id);

    // Handle user authentication and set online status
    socket.on('userConnected', async ({ userId }) => {
      try {
        if (userId) {
          // Update user online status in database
          await User.findByIdAndUpdate(userId, { 
            online: true,
            lastActive: new Date()
          });
          
          // Get user details
          const user = await User.findById(userId).select('-password');
          if (user) {
            socket.userId = userId;
            socket.user = user;
            globalOnlineUsers.set(socket.id, user);
            
            // Emit to all admins that a user came online
            io.emit('userStatusChanged', {
              userId: user._id,
              online: true,
              user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                memberRole: user.memberRole
              }
            });
            
            // Send current online users to admins
            await emitOnlineUsersToAdmins(io, globalOnlineUsers);
          }
        }
      } catch (error) {
        console.error('Error setting user online:', error);
      }
    });

    // Admin: Request all online users
    socket.on('getOnlineUsers', async () => {
      try {
        // Get all online users from database
        const onlineUsersFromDB = await User.find({ online: true })
          .select('name email role memberRole _id lastActive')
          .lean();
        
        socket.emit('onlineUsersList', onlineUsersFromDB);
      } catch (error) {
        console.error('Error fetching online users:', error);
      }
    });

    socket.on('joinRoom', ({ room, user }) => {
      socket.join(room);
      socket.room = room;
      socket.user = user;
      if (!onlineUsers[room]) onlineUsers[room] = {};
      onlineUsers[room][socket.id] = user;
      io.to(room).emit('onlineUsers', Object.values(onlineUsers[room]));
      
      // Track user joining room
      trackActivity(io, {
        type: 'user_joined_room',
        user: user._id,
        room: room,
        message: `${user.name} joined the room`,
        data: { room }
      });
      
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    // File editing events
    socket.on('joinFile', async ({ fileId, user }) => {
      try {
        // Check if user is already in this file
        if (socket.fileId === fileId && socket.fileUser && socket.fileUser._id === user._id) {
          console.log(`User ${user.name} already in file: ${fileId}`);
          return;
        }

        // Leave previous file if any
        if (socket.fileId && socket.fileId !== fileId) {
          socket.leave(socket.fileId);
          if (fileEditingUsers[socket.fileId]) {
            delete fileEditingUsers[socket.fileId][socket.id];
          }
        }

        socket.fileId = fileId;
        socket.fileUser = user;
        socket.join(fileId); // Join the file room
        
        if (!fileEditingUsers[fileId]) fileEditingUsers[fileId] = {};
        if (!fileCursors[fileId]) fileCursors[fileId] = {};
        
        // Check if user is already in the file
        const existingUser = fileEditingUsers[fileId][socket.id];
        if (existingUser && existingUser._id === user._id) {
          console.log(`User ${user.name} already in file: ${fileId}`);
          return;
        }
        
        fileEditingUsers[fileId][socket.id] = user;
        
        // Only create new cursor if user doesn't have one
        if (!fileCursors[fileId][user._id]) {
          fileCursors[fileId][user._id] = {
            position: 0,
            name: user.name,
            color: getRandomColor()
          };
        }

        // Update file with new collaborator and cursor position
        const file = await File.findById(fileId);
        if (file) {
          // Add collaborator if not already present
          const existingCollaborator = file.collaborators.find(
            collab => collab.user.toString() === user._id
          );
          
          if (!existingCollaborator) {
            file.collaborators.push({ user: user._id });
          }

          // Update cursor position
          const existingCursorIndex = file.cursorPositions.findIndex(
            cursor => cursor.user.toString() === user._id
          );

          if (existingCursorIndex >= 0) {
            file.cursorPositions[existingCursorIndex] = {
              user: user._id,
              position: 0,
              name: user.name,
              color: fileCursors[fileId][user._id].color
            };
          } else {
            file.cursorPositions.push({
              user: user._id,
              position: 0,
              name: user.name,
              color: fileCursors[fileId][user._id].color
            });
          }

          await file.save();
        }

        // Notify other users in the file
        socket.to(fileId).emit('userJoinedFile', {
          user,
          cursor: fileCursors[fileId][user._id]
        });

        // Send current file state to the joining user
        const updatedFile = await File.findById(fileId)
          .populate('collaborators.user', 'name _id')
          .populate('cursorPositions.user', 'name _id');
        
        if (updatedFile) {
          // Get current active collaborators (users currently in the file)
          const activeCollaborators = Object.values(fileEditingUsers[fileId] || {});
          
          socket.emit('fileState', {
            file: updatedFile,
            cursors: fileCursors[fileId],
            activeCollaborators: activeCollaborators
          });
          
          // Also send the current active collaborators to the joining user
          socket.emit('activeCollaborators', {
            collaborators: activeCollaborators
          });
        }

        // Track file joining activity
        trackActivity(io, {
          type: 'user_joined_file',
          user: user._id,
          room: fileId,
          message: `${user.name} started editing a file`,
          data: { fileId, fileName: file?.name || 'Unknown file' }
        });

        console.log(`User ${user.name} joined file: ${fileId}`);
      } catch (error) {
        console.error('Error joining file:', error);
      }
    });

    socket.on('fileEdit', async ({ fileId, content, version, user }) => {
      try {
        // Broadcast the edit to other users in the file
        socket.to(fileId).emit('fileEdited', {
          content,
          version,
          user,
          timestamp: Date.now()
        });

        // Update cursor position if provided
        if (fileCursors[fileId] && fileCursors[fileId][user._id]) {
          fileCursors[fileId][user._id].lastActivity = Date.now();
        }
      } catch (error) {
        console.error('Error broadcasting file edit:', error);
      }
    });

    socket.on('saveFile', async ({ fileId, content, version, user }) => {
      try {
        const file = await File.findById(fileId);
        if (!file) return;

        // Version conflict check
        if (file.version !== version) {
          socket.emit('saveConflict', {
            message: 'Version conflict detected',
            currentVersion: file.version,
            currentContent: file.content
          });
          return;
        }

        // Update file in database
        file.content = content;
        file.version = version + 1;
        file.lastModifiedBy = user._id;
        file.updatedAt = new Date();
        await file.save();

        // Track file save activity
        trackActivity(io, {
          type: 'file_saved',
          user: user._id,
          room: fileId,
          message: `${user.name} saved changes to a file`,
          data: { fileId, fileName: file.name }
        });

        socket.emit('fileSaved', {
          message: 'File saved successfully',
          version: file.version
        });

        console.log(`File ${fileId} saved by ${user.name}`);
      } catch (error) {
        console.error('Error saving file:', error);
        socket.emit('saveError', { message: 'Failed to save file' });
      }
    });

    socket.on('cursorMove', ({ fileId, position, user }) => {
      try {
        if (fileCursors[fileId] && fileCursors[fileId][user._id]) {
          fileCursors[fileId][user._id].position = position;
          fileCursors[fileId][user._id].lastActivity = Date.now();
          
          // Broadcast cursor movement to other users
          socket.to(fileId).emit('cursorMoved', {
            user,
            position,
            color: fileCursors[fileId][user._id].color
          });
        }
      } catch (error) {
        console.error('Error broadcasting cursor movement:', error);
      }
    });

    // Chat events
    socket.on('sendMessage', async ({ room, message, user }) => {
      try {
        const newMessage = await Message.create({
          room,
          sender: user._id,
          content: message,
          timestamp: new Date()
        });

        const populatedMessage = await newMessage.populate('sender', 'name email avatar');
        
        io.to(room).emit('newMessage', populatedMessage);

        // Track message activity
        trackActivity(io, {
          type: 'message_sent',
          user: user._id,
          room: room,
          message: `${user.name} sent a message`,
          data: { messageId: newMessage._id, messagePreview: message.substring(0, 50) }
        });

        console.log(`Message sent in room ${room} by ${user.name}`);
      } catch (error) {
        console.error('Error sending message:', error);
      }
    });

    socket.on('typing', ({ room, user, isTyping }) => {
      if (isTyping) {
        if (!typingUsers[room]) typingUsers[room] = {};
        typingUsers[room][socket.id] = user;
      } else {
        if (typingUsers[room]) {
          delete typingUsers[room][socket.id];
        }
      }
      socket.to(room).emit('typing', {
        users: Object.values(typingUsers[room] || {}),
        isTyping
      });
    });

    socket.on('disconnect', async () => {
      console.log('🔴 User disconnected:', socket.id);
      
      // Update user online status in database
      if (socket.userId) {
        try {
          await User.findByIdAndUpdate(socket.userId, { 
            online: false,
            lastActive: new Date()
          });
          
          const user = globalOnlineUsers.get(socket.id);
          if (user) {
            // Emit to all admins that a user went offline
            io.emit('userStatusChanged', {
              userId: user._id,
              online: false,
              user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                memberRole: user.memberRole
              }
            });
          }
          
          globalOnlineUsers.delete(socket.id);
          
          // Send updated online users to admins
          await emitOnlineUsersToAdmins(io, globalOnlineUsers);
        } catch (error) {
          console.error('Error setting user offline:', error);
        }
      }
      
      // Remove from online users
      if (socket.room && onlineUsers[socket.room]) {
        delete onlineUsers[socket.room][socket.id];
        io.to(socket.room).emit('onlineUsers', Object.values(onlineUsers[socket.room]));
      }

      // Remove from file editing users
      if (socket.fileId && fileEditingUsers[socket.fileId]) {
        delete fileEditingUsers[socket.fileId][socket.id];
      }

      // Remove from typing users
      if (socket.room && typingUsers[socket.room]) {
        delete typingUsers[socket.room][socket.id];
        socket.to(socket.room).emit('typing', {
          users: Object.values(typingUsers[socket.room] || {}),
          isTyping: false
        });
      }

      // Track user leaving activity
      if (socket.user) {
        trackActivity(io, {
          type: 'user_left',
          user: socket.user._id,
          room: socket.room,
          message: `${socket.user.name} left`,
          data: { room: socket.room }
        });
      }
    });

    // Admin: Request all online users
    socket.on('getOnlineUsers', async () => {
      try {
        // Get all online users from database
        const onlineUsersFromDB = await User.find({ online: true })
          .select('name email role memberRole _id lastActive')
          .lean();
        
        socket.emit('onlineUsersList', onlineUsersFromDB);
      } catch (error) {
        console.error('Error fetching online users:', error);
      }
    });
  });

  // Function to get total online users count across all rooms
  io.getOnlineUsersCount = () => {
    let totalCount = 0;
    for (const room in onlineUsers) {
      totalCount += Object.keys(onlineUsers[room]).length;
    }
    return totalCount;
  };

  return io;
};

function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

module.exports = socketSetup;
