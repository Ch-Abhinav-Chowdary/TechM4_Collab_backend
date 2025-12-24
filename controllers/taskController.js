const Task = require('../models/Task');
const User = require('../models/User');
const workflowEngine = require('../services/workflowEngine');
const Activity = require('../models/Activity');
const { sendTaskAssignmentEmail, sendTaskCompletionEmail } = require('../services/emailService');
const upload = require('../middleware/uploadMiddleware');

// Get all tasks
exports.getAllTasks = async (req, res) => {
  try {
    const filter = {};
    if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo;
    }
    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email')
      .populate('proofFiles.uploadedBy', 'name email');
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// Create a new task
exports.createTask = async (req, res) => {
  try {
    // Only admin can assign tasks (createTask is already protected by adminOnly middleware, but double-check)
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin can create and assign tasks' });
    }

    const { title, description, assignedTo, dueDate, dependency, files } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    
    // Ensure assignedTo is an array
    let assignedToArray = [];
    if (assignedTo) {
      assignedToArray = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
    }
    
    const task = await Task.create({ 
      title, 
      description, 
      assignedTo: assignedToArray, 
      dueDate, 
      dependency, 
      files 
    });
    const populated = await task.populate('assignedTo', 'name email');

    // Track activity
    await trackTaskActivity('task_created', task, req.user);

    // Trigger workflow for task creation
    workflowEngine.trigger('task.created', { task: populated });

    // Send email notifications to assigned employees
    if (populated.assignedTo && populated.assignedTo.length > 0) {
      sendTaskAssignmentEmail(populated, populated.assignedTo)
        .then(result => {
          if (result.success) {
            console.log('✅ Task assignment emails sent successfully');
          } else {
            console.log('⚠️ Email sending failed:', result.error);
          }
        })
        .catch(err => console.error('❌ Email error:', err));
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: 'Task creation failed' });
  }
};

// Update a task
exports.updateTask = async (req, res) => {
  try {
    // Check if user is admin for assignment or status changes
    const isAdmin = req.user && req.user.role === 'admin';
    
    // Get the current task to check what's being changed
    const currentTask = await Task.findById(req.params.id);
    if (!currentTask) return res.status(404).json({ error: 'Task not found' });

    // If trying to change assignment, only admin can do this
    if (req.body.assignedTo !== undefined && req.body.assignedTo !== currentTask.assignedTo?.toString()) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admin can assign tasks' });
      }
    }

    // If trying to change status, only admin can do this
    if (req.body.status !== undefined && req.body.status !== currentTask.status) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admin can change task status' });
      }
    }

    // Build update object, excluding assignment and status if user is not admin
    const updateData = { ...req.body };
    if (!isAdmin) {
      // Non-admins cannot change assignment or status
      delete updateData.assignedTo;
      delete updateData.status;
    }

    const updated = await Task.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('assignedTo', 'name email');
    
    if (!updated) return res.status(404).json({ error: 'Task not found' });

    // Track task completion activity
    if (req.body.status === 'Done' && updated.assignedTo && updated.assignedTo.length > 0) {
      await trackTaskActivity('task_completed', updated, req.user);
      
      // Gamification: If status changed to Done, award points, badges, level to all assigned users
      for (const assigneeId of updated.assignedTo) {
        const userId = assigneeId._id || assigneeId;
        const user = await User.findById(userId);
        if (user && user.role !== 'viewer') {
          let pointsAwarded = 10;
          user.points += pointsAwarded;
          // Level up logic
          if (user.points >= user.level * 100) {
            user.level += 1;
          }
          // Badges
          const completedTasks = await Task.countDocuments({ 
            assignedTo: user._id, 
            status: 'Done' 
          });
          if (!user.badges.includes('task-novice') && completedTasks >= 1) {
            user.badges.push('task-novice');
          }
          if (!user.badges.includes('task-master') && completedTasks >= 25) {
            user.badges.push('task-master');
          }
          await user.save();
        }
      }
    }

    // Trigger workflow for task completion
    if (req.body.status === 'Done') {
      workflowEngine.trigger('task.completed', { task: updated });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Update failed' });
  }
};

// Delete a task
exports.deleteTask = async (req, res) => {
  try {
    const deleted = await Task.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Delete failed' });
  }
};

// Get task analytics
exports.getTaskAnalytics = async (req, res) => {
  try {
    const totalTasks = await Task.countDocuments();
    const tasksByStatus = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const overdueTasks = await Task.countDocuments({
      dueDate: { $lt: new Date() },
      status: { $ne: 'Done' }
    });

    res.json({
      totalTasks,
      tasksByStatus,
      overdueTasks,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task analytics' });
  }
};

// Upload proof for a task (for assigned members only)
exports.uploadTaskProof = (req, res) => {
  const taskId = req.params.id;
  const userId = req.user.id;
  
  // First check if task exists and user has permission
  Task.findById(taskId)
    .then(task => {
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Check if task has any assigned employees
      if (!task.assignedTo || task.assignedTo.length === 0) {
        return res.status(403).json({ 
          error: 'This task has no assigned employees. Only assigned employees can upload proof.' 
        });
      }

      // Check if user is assigned to this task
      // assignedTo is an array of ObjectIds, so we compare directly
      const isAssigned = task.assignedTo.some(assigneeId => {
        // Handle both ObjectId and string comparisons
        const assigneeIdStr = assigneeId.toString ? assigneeId.toString() : String(assigneeId);
        const userIdStr = userId.toString ? userId.toString() : String(userId);
        return assigneeIdStr === userIdStr;
      });

      // Only assigned employees can upload proof - strict enforcement, no admin exception
      if (!isAssigned) {
        return res.status(403).json({ 
          error: 'You can only upload proof for tasks assigned to you. This task is not assigned to you.' 
        });
      }

      // Handle file upload
      upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: err });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        try {
          // Add proof file to task
          const proofFile = {
            fileUrl: `uploads/${req.file.filename}`,
            fileName: req.file.originalname,
            uploadedBy: req.user.id,
            uploadedAt: new Date()
          };

          task.proofFiles = task.proofFiles || [];
          task.proofFiles.push(proofFile);
          await task.save();

          // Track activity
          await trackTaskActivity('task_proof_uploaded', task, req.user, {
            fileName: req.file.originalname
          });

          const populated = await Task.findById(taskId)
            .populate('assignedTo', 'name email')
            .populate('proofFiles.uploadedBy', 'name email');

          res.json({
            message: 'Proof uploaded successfully',
            task: populated
          });
        } catch (saveErr) {
          console.error('Error saving proof:', saveErr);
          res.status(500).json({ error: 'Failed to save proof file' });
        }
      });
    })
    .catch(err => {
      console.error('Proof upload error:', err);
      res.status(500).json({ error: 'Failed to upload proof' });
    });
};

// Add this function to track task activities
const trackTaskActivity = async (type, task, user, additionalData = {}) => {
  try {
    const activityMessages = {
      'task_created': `${user.name} created a new task`,
      'task_completed': `${user.name} completed a task`,
      'task_assigned': `${user.name} assigned a task`,
      'task_updated': `${user.name} updated a task`,
      'task_proof_uploaded': `${user.name} uploaded proof for a task`
    };

    await Activity.create({
      type,
      user: user._id,
      message: activityMessages[type],
      data: {
        taskId: task._id,
        taskTitle: task.title,
        ...additionalData
      }
    });
  } catch (error) {
    console.error('Error tracking task activity:', error);
  }
};
