const Workflow = require('../models/Workflow');
const Task = require('../models/Task');
const User = require('../models/User');

class WorkflowEngine {
  async trigger(event, data) {
    try {
      console.log(`🔄 Triggering workflows for event: ${event}`);
      console.log('📊 Event data:', JSON.stringify(data, null, 2));
      
      const workflows = await Workflow.find({ 
        triggerEvent: event, 
        isEnabled: true 
      }).sort({ priority: -1, createdAt: 1 });

      console.log(`📋 Found ${workflows.length} workflows to execute`);

      if (workflows.length === 0) {
        console.log('ℹ️ No workflows found for this event');
        return;
      }

      for (const workflow of workflows) {
        try {
          console.log(`⚡ Executing workflow: ${workflow.name} (ID: ${workflow._id})`);
          
          // Check conditions if they exist
          if (workflow.conditions && Object.keys(workflow.conditions).length > 0) {
            const shouldExecute = await this.evaluateConditions(workflow.conditions, data);
            if (!shouldExecute) {
              console.log(`⏭️ Skipping workflow ${workflow.name} - conditions not met`);
              continue;
            }
          }

          await this.executeAction(workflow.action, workflow.actionParams, data, workflow);
          
          // Update workflow execution stats
          workflow.executionCount += 1;
          workflow.lastExecuted = new Date();
          await workflow.save();

          console.log(`✅ Workflow ${workflow.name} executed successfully (${workflow.executionCount} total executions)`);

          if (workflow.runOnce) {
            await Workflow.findByIdAndDelete(workflow._id);
            console.log(`🗑️ Workflow "${workflow.name}" was deleted after running once.`);
          }
        } catch (error) {
          console.error(`❌ Error executing workflow ${workflow.name}:`, error.message);
          // Continue with other workflows even if one fails
        }
      }
    } catch (error) {
      console.error('❌ Error in workflow engine trigger:', error.message);
    }
  }

  async evaluateConditions(conditions, data) {
    try {
      // Simple condition evaluation - can be expanded
      if (conditions.taskStatus && data.task) {
        if (data.task.status !== conditions.taskStatus) {
          return false;
        }
      }
      
      if (conditions.userRole && data.task?.assignedTo) {
        // Handle array of assignees
        const assignees = Array.isArray(data.task.assignedTo) 
          ? data.task.assignedTo 
          : [data.task.assignedTo];
        
        // Check if at least one assignee matches the role condition
        let roleMatches = false;
        for (const assignee of assignees) {
          const userId = assignee._id || assignee;
          const user = await User.findById(userId);
          if (user && user.role === conditions.userRole) {
            roleMatches = true;
            break;
          }
        }
        
        if (!roleMatches) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error evaluating conditions:', error.message);
      return true; // Default to executing if condition evaluation fails
    }
  }

  async executeAction(action, params, triggerData, workflow) {
    console.log(`🎯 Executing action: ${action}`);
    console.log('📝 Action params:', JSON.stringify(params, null, 2));

    switch (action) {
      case 'create.task':
        return await this.createTask(params, triggerData, workflow);
      case 'send.email':
        return await this.sendEmail(params, triggerData, workflow);
      case 'send.notification':
        return await this.sendNotification(params, triggerData, workflow);
      case 'update.status':
        return await this.updateStatus(params, triggerData, workflow);
      case 'send.slack':
        return await this.sendSlack(params, triggerData, workflow);
      case 'send.discord':
        return await this.sendDiscord(params, triggerData, workflow);
      case 'create.file':
        return await this.createFile(params, triggerData, workflow);
      case 'move.file':
        return await this.moveFile(params, triggerData, workflow);
      case 'archive.task':
        return await this.archiveTask(params, triggerData, workflow);
      case 'assign.task':
        return await this.assignTask(params, triggerData, workflow);
      case 'award.points':
        return await this.awardPoints(params, triggerData, workflow);
      case 'create.reminder':
        return await this.createReminder(params, triggerData, workflow);
      case 'send.webhook':
        return await this.sendWebhook(params, triggerData, workflow);
      default:
        console.warn(`⚠️ Unknown action: ${action}`);
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async createTask(params, triggerData, workflow) {
    try {
      let taskTitle = params.title || 'Auto-generated Task';
      let taskDescription = params.description || '';
      
      // Replace placeholders with actual data
      if (triggerData.task) {
        taskTitle = this.replacePlaceholders(taskTitle, triggerData.task);
        taskDescription = this.replacePlaceholders(taskDescription, triggerData.task);
      }

      // Handle assignedTo field - now supports arrays
      let assignedTo = params.assignedTo || [];
      
      if (triggerData.task?.assignedTo && Array.isArray(triggerData.task.assignedTo)) {
        // Extract IDs from array of users
        assignedTo = triggerData.task.assignedTo.map(user => {
          if (typeof user === 'object' && user._id) {
            return user._id;
          }
          return user; // Already an ID string
        });
      } else if (params.assignedTo) {
        // If assignedTo is provided in params, ensure it's an array
        assignedTo = Array.isArray(params.assignedTo) ? params.assignedTo : [params.assignedTo];
      }

      const newTask = {
        title: taskTitle,
        description: taskDescription,
        assignedTo: assignedTo, // Now an array of user IDs
        status: 'To Do',
        priority: params.priority || 'Medium',
        dueDate: params.dueDate ? new Date(params.dueDate) : null,
      };
      
      const createdTask = await Task.create(newTask);
      const populatedTask = await createdTask.populate('assignedTo', 'name email');
      
      console.log('✅ Workflow action "create.task" executed successfully');
      console.log('📋 Created task:', populatedTask.title);
      const assigneeNames = Array.isArray(populatedTask.assignedTo) 
        ? populatedTask.assignedTo.map(u => u.name).join(', ')
        : 'Unassigned';
      console.log('👤 Assigned to:', assigneeNames);
      
      return populatedTask;
    } catch (error) {
      console.error('❌ Error executing "create.task" action:', error.message);
      throw error;
    }
  }

  async sendEmail(params, triggerData, workflow) {
    try {
      // Handle multiple recipients (assignedTo is now an array)
      let recipients = [];
      
      if (triggerData.task?.assignedTo && Array.isArray(triggerData.task.assignedTo)) {
        recipients = triggerData.task.assignedTo
          .filter(user => user && user.email)
          .map(user => user.email);
      }
      
      // Fallback to params or default
      if (recipients.length === 0) {
        recipients = params.recipient ? [params.recipient] : ['default@example.com'];
      }

      let subject = params.subject || 'Workflow Notification';
      let body = params.body || 'This is an automated notification from your workflow.';

      // Replace placeholders
      if (triggerData.task) {
        subject = this.replacePlaceholders(subject, triggerData.task);
        body = this.replacePlaceholders(body, triggerData.task);
      }

      console.log('📧 --- SENDING EMAIL ---');
      console.log(`📮 To: ${recipients.join(', ')}`);
      console.log(`📄 Subject: ${subject}`);
      console.log(`📝 Body: ${body}`);
      console.log('📧 ---------------------');
      
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      // For now, just log the email details
      
      return { recipients, subject, body };
    } catch (error) {
      console.error('❌ Error executing "send.email" action:', error.message);
      throw error;
    }
  }

  async sendNotification(params, triggerData, workflow) {
    try {
      const message = params.message || 'Workflow notification';
      
      // Handle multiple recipients (assignedTo is now an array)
      let recipients = [];
      
      if (triggerData.task?.assignedTo && Array.isArray(triggerData.task.assignedTo)) {
        recipients = triggerData.task.assignedTo
          .filter(user => user && user._id)
          .map(user => user._id.toString());
      }
      
      // Fallback to params
      if (recipients.length === 0 && params.recipient) {
        recipients = [params.recipient];
      }
      
      let notificationMessage = this.replacePlaceholders(message, triggerData.task || {});

      console.log('🔔 --- SENDING NOTIFICATION ---');
      console.log(`👤 To: ${recipients.join(', ')}`);
      console.log(`💬 Message: ${notificationMessage}`);
      console.log('🔔 ----------------------------');
      
      // TODO: Integrate with notification service (push notifications, in-app notifications)
      // For now, just log the notification details
      
      return { recipients, message: notificationMessage };
    } catch (error) {
      console.error('❌ Error executing "send.notification" action:', error.message);
      throw error;
    }
  }

  async updateStatus(params, triggerData, workflow) {
    try {
      const newStatus = params.status || 'In Progress';
      const taskId = triggerData.task?._id || params.taskId;
      
      if (!taskId) {
        throw new Error('No task ID provided for status update');
      }

      const updatedTask = await Task.findByIdAndUpdate(
        taskId,
        { status: newStatus },
        { new: true }
      ).populate('assignedTo', 'name email');

      console.log('✅ Workflow action "update.status" executed successfully');
      console.log(`📋 Task ${updatedTask.title} status updated to: ${newStatus}`);
      
      return updatedTask;
    } catch (error) {
      console.error('❌ Error executing "update.status" action:', error.message);
      throw error;
    }
  }

  async sendSlack(params, triggerData, workflow) {
    try {
      const channel = params.channel || '#general';
      const message = params.message || 'Workflow notification';
      
      let slackMessage = this.replacePlaceholders(message, triggerData.task || {});

      console.log('💬 --- SENDING SLACK MESSAGE ---');
      console.log(`💬 Channel: ${channel}`);
      console.log(`💬 Message: ${slackMessage}`);
      console.log('💬 ----------------------------');
      
      // TODO: Integrate with Slack API
      // For now, just log the message details
      
      return { channel, message: slackMessage };
    } catch (error) {
      console.error('❌ Error executing "send.slack" action:', error.message);
      throw error;
    }
  }

  async sendDiscord(params, triggerData, workflow) {
    try {
      const webhookUrl = params.webhookUrl;
      const message = params.message || 'Workflow notification';
      
      let discordMessage = this.replacePlaceholders(message, triggerData.task || {});

      console.log('🎮 --- SENDING DISCORD MESSAGE ---');
      console.log(`🎮 Webhook: ${webhookUrl}`);
      console.log(`�� Message: ${discordMessage}`);
      console.log('🎮 ----------------------------');
      
      // TODO: Integrate with Discord webhook
      // For now, just log the message details
      
      return { webhookUrl, message: discordMessage };
    } catch (error) {
      console.error('❌ Error executing "send.discord" action:', error.message);
      throw error;
    }
  }

  async createFile(params, triggerData, workflow) {
    try {
      const fileName = params.fileName || 'workflow-generated-file.txt';
      const content = params.content || 'This file was created by a workflow.';
      
      console.log('📄 --- CREATING FILE ---');
      console.log(`📁 File name: ${fileName}`);
      console.log(`📝 Content: ${content}`);
      console.log('📄 --------------------');
      
      // TODO: Implement file creation logic
      // For now, just log the file details
      
      return { fileName, content };
    } catch (error) {
      console.error('❌ Error executing "create.file" action:', error.message);
      throw error;
    }
  }

  async moveFile(params, triggerData, workflow) {
    try {
      const sourcePath = params.sourcePath;
      const destinationPath = params.destinationPath;
      
      console.log('📁 --- MOVING FILE ---');
      console.log(`📁 From: ${sourcePath}`);
      console.log(`📂 To: ${destinationPath}`);
      console.log('📁 -------------------');
      
      // TODO: Implement file moving logic
      // For now, just log the move details
      
      return { sourcePath, destinationPath };
    } catch (error) {
      console.error('❌ Error executing "move.file" action:', error.message);
      throw error;
    }
  }

  async archiveTask(params, triggerData, workflow) {
    try {
      const taskId = triggerData.task?._id || params.taskId;
      
      if (!taskId) {
        throw new Error('No task ID provided for archiving');
      }

      const archivedTask = await Task.findByIdAndUpdate(
        taskId,
        { 
          status: 'Archived',
          archivedAt: new Date(),
          archivedBy: workflow._id
        },
        { new: true }
      ).populate('assignedTo', 'name email');

      console.log('✅ Workflow action "archive.task" executed successfully');
      console.log(`📋 Task ${archivedTask.title} has been archived`);
      
      return archivedTask;
    } catch (error) {
      console.error('❌ Error executing "archive.task" action:', error.message);
      throw error;
    }
  }

  async assignTask(params, triggerData, workflow) {
    try {
      const taskId = triggerData.task?._id || params.taskId;
      let assigneeIds = params.assigneeId || params.assigneeIds;
      
      if (!taskId) {
        throw new Error('No task ID provided for assignment');
      }

      if (!assigneeIds) {
        throw new Error('No assignee ID(s) provided');
      }

      // Ensure assigneeIds is an array
      assigneeIds = Array.isArray(assigneeIds) ? assigneeIds : [assigneeIds];

      const assignedTask = await Task.findByIdAndUpdate(
        taskId,
        { assignedTo: assigneeIds },
        { new: true }
      ).populate('assignedTo', 'name email');

      console.log('✅ Workflow action "assign.task" executed successfully');
      const assigneeNames = Array.isArray(assignedTask.assignedTo)
        ? assignedTask.assignedTo.map(u => u.name).join(', ')
        : 'Unknown';
      console.log(`📋 Task ${assignedTask.title} assigned to: ${assigneeNames}`);
      
      return assignedTask;
    } catch (error) {
      console.error('❌ Error executing "assign.task" action:', error.message);
      throw error;
    }
  }

  async awardPoints(params, triggerData, workflow) {
    try {
      const points = params.points || 10;
      
      // Handle multiple assignees
      let userIds = [];
      
      if (triggerData.task?.assignedTo && Array.isArray(triggerData.task.assignedTo)) {
        userIds = triggerData.task.assignedTo
          .filter(user => user && (user._id || user))
          .map(user => user._id || user);
      } else if (params.userId) {
        userIds = Array.isArray(params.userId) ? params.userId : [params.userId];
      }
      
      if (userIds.length === 0) {
        throw new Error('No user ID(s) provided for awarding points');
      }

      const results = [];
      
      for (const userId of userIds) {
        const user = await User.findById(userId);
        if (!user) {
          console.warn(`⚠️ User not found: ${userId}`);
          continue;
        }

        user.points += points;
        
        // Level up logic
        const newLevel = Math.floor(user.points / 100) + 1;
        if (newLevel > user.level) {
          user.level = newLevel;
          console.log(`🎉 User ${user.name} leveled up to level ${user.level}!`);
        }

        await user.save();
        
        console.log(`👤 Awarded ${points} points to ${user.name} (Total: ${user.points})`);
        results.push({ user, pointsAwarded: points });
      }

      console.log('✅ Workflow action "award.points" executed successfully');
      console.log(`🏆 Awarded points to ${results.length} user(s)`);
      
      return results;
    } catch (error) {
      console.error('❌ Error executing "award.points" action:', error.message);
      throw error;
    }
  }

  async createReminder(params, triggerData, workflow) {
    try {
      const title = params.title || 'Workflow Reminder';
      const message = params.message || 'This is a reminder from your workflow.';
      const dueDate = params.dueDate ? new Date(params.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default to tomorrow
      
      console.log('⏰ --- CREATING REMINDER ---');
      console.log(`📝 Title: ${title}`);
      console.log(`📝 Message: ${message}`);
      console.log(`📅 Due: ${dueDate}`);
      console.log('⏰ ------------------------');
      
      // TODO: Implement reminder creation logic
      // For now, just log the reminder details
      
      return { title, message, dueDate };
    } catch (error) {
      console.error('❌ Error executing "create.reminder" action:', error.message);
      throw error;
    }
  }

  async sendWebhook(params, triggerData, workflow) {
    try {
      const url = params.url;
      const method = params.method || 'POST';
      const headers = params.headers || { 'Content-Type': 'application/json' };
      const body = params.body || triggerData;
      
      console.log('🌐 --- SENDING WEBHOOK ---');
      console.log(`🔗 URL: ${url}`);
      console.log(`📡 Method: ${method}`);
      console.log(`📡 Headers:`, headers);
      console.log(`📦 Body:`, body);
      console.log('🌐 ----------------------');
      
      // TODO: Implement webhook sending logic
      // For now, just log the webhook details
      
      return { url, method, headers, body };
    } catch (error) {
      console.error('❌ Error executing "send.webhook" action:', error.message);
      throw error;
    }
  }

  replacePlaceholders(text, data) {
    if (!text || typeof text !== 'string') return text;
    
    // Handle multiple assignees
    let userNames = '';
    let userEmails = '';
    
    if (data.assignedTo) {
      if (Array.isArray(data.assignedTo)) {
        userNames = data.assignedTo.map(u => u.name || '').join(', ');
        userEmails = data.assignedTo.map(u => u.email || '').join(', ');
      } else {
        userNames = data.assignedTo.name || '';
        userEmails = data.assignedTo.email || '';
      }
    }
    
    return text
      .replace(/{task\.title}/g, data.title || '')
      .replace(/{task\.description}/g, data.description || '')
      .replace(/{task\.status}/g, data.status || '')
      .replace(/{user\.name}/g, userNames)
      .replace(/{user\.email}/g, userEmails)
      .replace(/{date}/g, new Date().toLocaleDateString())
      .replace(/{time}/g, new Date().toLocaleTimeString())
      .replace(/{workflow\.name}/g, data.workflow?.name || '');
  }

  // Helper method to get workflow statistics
  async getWorkflowStats() {
    try {
      const stats = await Workflow.aggregate([
        {
          $group: {
            _id: null,
            totalWorkflows: { $sum: 1 },
            enabledWorkflows: { $sum: { $cond: ['$isEnabled', 1, 0] } },
            totalExecutions: { $sum: '$executionCount' }
          }
        }
      ]);

      return stats[0] || { totalWorkflows: 0, enabledWorkflows: 0, totalExecutions: 0 };
    } catch (error) {
      console.error('❌ Error getting workflow stats:', error.message);
      return { totalWorkflows: 0, enabledWorkflows: 0, totalExecutions: 0 };
    }
  }

  // Helper method to get workflow execution history
  async getWorkflowHistory(limit = 10) {
    try {
      const workflows = await Workflow.find({ executionCount: { $gt: 0 } })
        .sort({ lastExecuted: -1 })
        .limit(limit)
        .select('name executionCount lastExecuted triggerEvent action');

      return workflows;
    } catch (error) {
      console.error('❌ Error getting workflow history:', error.message);
      return [];
    }
  }
}

module.exports = new WorkflowEngine(); 