const express = require('express');
const router = express.Router();
const Workflow = require('../models/Workflow');
const workflowEngine = require('../services/workflowEngine');

// Get all workflows
router.get('/', async (req, res) => {
  try {
    const workflows = await Workflow.find().populate('createdBy', 'name email').sort({ createdAt: -1 });
    res.json(workflows);
  } catch (err) {
    console.error('❌ Error fetching workflows:', err);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// Get workflow statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await workflowEngine.getWorkflowStats();
    res.json(stats);
  } catch (err) {
    console.error('❌ Error fetching workflow stats:', err);
    res.status(500).json({ error: 'Failed to fetch workflow statistics' });
  }
});

// Get workflow execution history
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await workflowEngine.getWorkflowHistory(limit);
    res.json(history);
  } catch (err) {
    console.error('❌ Error fetching workflow history:', err);
    res.status(500).json({ error: 'Failed to fetch workflow history' });
  }
});

// Get a specific workflow
router.get('/:id', async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id).populate('createdBy', 'name email');
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json(workflow);
  } catch (err) {
    console.error('❌ Error fetching workflow:', err);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// Create a new workflow
router.post('/', async (req, res) => {
  try {
    const { name, description, triggerEvent, action, actionParams, conditions, runOnce, priority, tags } = req.body;
    
    // Validation
    if (!name || !triggerEvent || !action) {
      return res.status(400).json({ 
        error: 'Name, triggerEvent, and action are required' 
      });
    }

    const newWorkflow = await Workflow.create({
      name,
      description,
      triggerEvent,
      action,
      actionParams,
      conditions: conditions || {},
      runOnce: runOnce || false,
      priority: priority || 1,
      tags: tags || [],
      createdBy: req.user?._id, // If user is available from auth middleware
      isEnabled: true
    });

    const populatedWorkflow = await newWorkflow.populate('createdBy', 'name email');
    
    console.log('✅ New workflow created:', populatedWorkflow.name);
    res.status(201).json(populatedWorkflow);
  } catch (err) {
    console.error('❌ Error creating workflow:', err);
    res.status(400).json({ 
      error: 'Failed to create workflow',
      details: err.message 
    });
  }
});

// Update a workflow
router.put('/:id', async (req, res) => {
  try {
    const { name, description, triggerEvent, action, actionParams, conditions, isEnabled, runOnce, priority, tags } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (triggerEvent !== undefined) updateData.triggerEvent = triggerEvent;
    if (action !== undefined) updateData.action = action;
    if (actionParams !== undefined) updateData.actionParams = actionParams;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (runOnce !== undefined) updateData.runOnce = runOnce;
    if (priority !== undefined) updateData.priority = priority;
    if (tags !== undefined) updateData.tags = tags;

    const updated = await Workflow.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!updated) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    console.log('✅ Workflow updated:', updated.name);
    res.json(updated);
  } catch (err) {
    console.error('❌ Error updating workflow:', err);
    res.status(400).json({ 
      error: 'Failed to update workflow',
      details: err.message 
    });
  }
});

// Toggle workflow enabled/disabled status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    workflow.isEnabled = !workflow.isEnabled;
    await workflow.save();

    console.log(`✅ Workflow ${workflow.name} ${workflow.isEnabled ? 'enabled' : 'disabled'}`);
    res.json(workflow);
  } catch (err) {
    console.error('❌ Error toggling workflow:', err);
    res.status(400).json({ error: 'Failed to toggle workflow' });
  }
});

// Delete a workflow
router.delete('/:id', async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await Workflow.findByIdAndDelete(req.params.id);
    console.log('🗑️ Workflow deleted:', workflow.name);
    res.json({ message: 'Workflow deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting workflow:', err);
    res.status(400).json({ error: 'Failed to delete workflow' });
  }
});

// Test a workflow (manual trigger)
router.post('/:id/test', async (req, res) => {
  try {
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (!workflow.isEnabled) {
      return res.status(400).json({ error: 'Workflow is disabled' });
    }

    const testData = req.body.testData || { task: { title: 'Test Task', description: 'Test Description' } };
    
    console.log('🧪 Testing workflow:', workflow.name);
    await workflowEngine.executeAction(workflow.action, workflow.actionParams, testData, workflow);
    
    res.json({ 
      message: 'Workflow test executed successfully',
      workflow: workflow.name,
      action: workflow.action
    });
  } catch (err) {
    console.error('❌ Error testing workflow:', err);
    res.status(400).json({ 
      error: 'Failed to test workflow',
      details: err.message 
    });
  }
});

// Seed sample workflows
router.post('/seed', async (req, res) => {
  try {
    const sampleWorkflows = [
      {
        name: 'Auto Follow-up Task',
        description: 'Automatically creates a follow-up task when a task is completed',
        triggerEvent: 'task.completed',
        action: 'create.task',
        actionParams: {
          title: 'Follow-up on: {task.title}',
          description: 'This is an automated follow-up task created when "{task.title}" was completed.',
          priority: 'Medium'
        },
        runOnce: false,
        priority: 1,
        tags: ['automation', 'follow-up']
      },
      {
        name: 'Task Completion Notification',
        description: 'Sends an email notification when a task is completed',
        triggerEvent: 'task.completed',
        action: 'send.email',
        actionParams: {
          subject: 'Task Completed: {task.title}',
          body: 'Congratulations! The task "{task.title}" has been completed by {user.name}.'
        },
        runOnce: false,
        priority: 2,
        tags: ['notification', 'email']
      },
      {
        name: 'New Task Welcome',
        description: 'Sends a welcome notification when a new task is created',
        triggerEvent: 'task.created',
        action: 'send.notification',
        actionParams: {
          message: 'New task assigned: {task.title}. Please review and start working on it.'
        },
        runOnce: false,
        priority: 3,
        tags: ['welcome', 'notification']
      },
      {
        name: 'Task Completion Points',
        description: 'Awards points to users when they complete tasks',
        triggerEvent: 'task.completed',
        action: 'award.points',
        actionParams: {
          points: 15
        },
        runOnce: false,
        priority: 4,
        tags: ['gamification', 'points']
      },
      {
        name: 'Overdue Task Reminder',
        description: 'Creates a reminder for overdue tasks',
        triggerEvent: 'task.overdue',
        action: 'create.reminder',
        actionParams: {
          title: 'Overdue Task: {task.title}',
          message: 'The task "{task.title}" is overdue. Please complete it as soon as possible.',
          dueDate: '{date}'
        },
        runOnce: false,
        priority: 5,
        tags: ['reminder', 'overdue']
      }
    ];

    const createdWorkflows = [];
    
    for (const workflowData of sampleWorkflows) {
      const existing = await Workflow.findOne({ name: workflowData.name });
      if (!existing) {
        const workflow = await Workflow.create(workflowData);
        createdWorkflows.push(workflow);
        console.log('✅ Created sample workflow:', workflow.name);
      }
    }

    res.status(201).json({ 
      message: 'Sample workflows created successfully',
      created: createdWorkflows.length,
      workflows: createdWorkflows
    });
  } catch (error) {
    console.error('❌ Error seeding workflows:', error);
    res.status(500).json({ error: 'Failed to seed workflows' });
  }
});

module.exports = router; 