const nodemailer = require('nodemailer');

// Create a transporter
const createTransporter = () => {
  // For development, use a test account from ethereal.email
  // For production, use your actual email service (Gmail, SendGrid, etc.)
  
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
      }
    });
  } else {
    // Development mode - log emails to console
    return nodemailer.createTransporter({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER || 'test@example.com',
        pass: process.env.EMAIL_PASSWORD || 'test'
      }
    });
  }
};

// Send task assignment email
const sendTaskAssignmentEmail = async (task, assignees) => {
  try {
    const transporter = createTransporter();
    
    // Send email to each assignee
    for (const assignee of assignees) {
      if (!assignee.email) continue;
      
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"TechM4India" <noreply@techm4india.com>',
        to: assignee.email,
        subject: `📋 New Task Assigned: ${task.title}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
                color: white;
                padding: 30px;
                border-radius: 10px 10px 0 0;
                text-align: center;
              }
              .content {
                background: #f9f9f9;
                padding: 30px;
                border-radius: 0 0 10px 10px;
              }
              .task-details {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .task-title {
                font-size: 20px;
                font-weight: bold;
                color: #667EEA;
                margin-bottom: 10px;
              }
              .detail-row {
                margin: 10px 0;
                padding: 8px 0;
                border-bottom: 1px solid #eee;
              }
              .detail-label {
                font-weight: bold;
                color: #666;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #666;
                font-size: 12px;
              }
              .button {
                display: inline-block;
                padding: 12px 24px;
                background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin-top: 20px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>📋 New Task Assigned</h1>
              <p>You have been assigned a new task</p>
            </div>
            <div class="content">
              <p>Hi <strong>${assignee.name}</strong>,</p>
              <p>You have been assigned a new task. Here are the details:</p>
              
              <div class="task-details">
                <div class="task-title">${task.title}</div>
                
                <div class="detail-row">
                  <span class="detail-label">Description:</span><br>
                  ${task.description || 'No description provided'}
                </div>
                
                ${task.dueDate ? `
                <div class="detail-row">
                  <span class="detail-label">Due Date:</span><br>
                  ${new Date(task.dueDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
                ` : ''}
                
                <div class="detail-row">
                  <span class="detail-label">Status:</span><br>
                  ${task.status || 'To Do'}
                </div>
                
                ${task.assignedTo && task.assignedTo.length > 1 ? `
                <div class="detail-row">
                  <span class="detail-label">Team Members:</span><br>
                  ${task.assignedTo.map(a => a.name).join(', ')}
                </div>
                ` : ''}
              </div>
              
              <p>Please log in to your dashboard to view more details and start working on this task.</p>
              
              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="button">
                  View Task Dashboard
                </a>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated email from TechM4India Task Management System.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </body>
          </html>
        `
      };

      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${assignee.email}:`, info.messageId);
      
      // For development with Ethereal, log the preview URL
      if (process.env.NODE_ENV !== 'production') {
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
      }
    }
    
    return { success: true, message: 'Emails sent successfully' };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    // Don't throw error - email failure shouldn't stop task creation
    return { success: false, error: error.message };
  }
};

// Send task completion email
const sendTaskCompletionEmail = async (task, assignees) => {
  try {
    const transporter = createTransporter();
    
    for (const assignee of assignees) {
      if (!assignee.email) continue;
      
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"TechM4India" <noreply@techm4india.com>',
        to: assignee.email,
        subject: `✅ Task Completed: ${task.title}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                color: white;
                padding: 30px;
                border-radius: 10px 10px 0 0;
                text-align: center;
              }
              .content {
                background: #f9f9f9;
                padding: 30px;
                border-radius: 0 0 10px 10px;
              }
              .success-icon {
                font-size: 60px;
                text-align: center;
                margin: 20px 0;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>✅ Task Completed!</h1>
            </div>
            <div class="content">
              <div class="success-icon">🎉</div>
              <p>Hi <strong>${assignee.name}</strong>,</p>
              <p>Congratulations! The task "<strong>${task.title}</strong>" has been marked as completed.</p>
              <p>Great job on completing this task!</p>
            </div>
          </body>
          </html>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`✅ Completion email sent to ${assignee.email}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending completion email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendTaskAssignmentEmail,
  sendTaskCompletionEmail
};

