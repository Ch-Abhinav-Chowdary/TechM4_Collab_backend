# Email Configuration Setup

## Overview
The application now supports sending email notifications to employees when tasks are assigned to them.

## Email Service Configuration

### Option 1: Gmail (Recommended for Production)

1. **Enable 2-Factor Authentication**
   - Go to your Google Account settings
   - Security → 2-Step Verification → Turn On

2. **Generate App Password**
   - Go to Security → App passwords
   - Select app: Mail
   - Select device: Other (Custom name)
   - Name it: "TechM4India Task Manager"
   - Copy the 16-character password

3. **Update .env file**
   ```env
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-16-char-app-password
   EMAIL_FROM="TechM4India <noreply@techm4india.com>"
   FRONTEND_URL=http://localhost:5173
   ```

### Option 2: Development Mode (Default)

For development/testing, the system will log email content to the console instead of actually sending emails.

Simply don't set EMAIL_SERVICE in your .env file, and the system will use console logging.

## Email Features

### Task Assignment Email
- Sent automatically when admin assigns a task to employees
- Contains:
  - Task title and description
  - Due date (if set)
  - Status
  - List of all assigned team members
  - Link to dashboard

### Task Completion Email
- Sent when a task is marked as "Done"
- Congratulates the employee on task completion

## Testing

1. **Install nodemailer** (already in package.json):
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Create a task and assign it to an employee**
   - The email will be sent automatically
   - Check console logs for email preview URLs (in development mode)

## Troubleshooting

### Gmail "Less secure app" error
- Solution: Use App Password (see Option 1 above)
- Never use your actual Gmail password

### Emails not sending
- Check console logs for errors
- Verify EMAIL_USER and EMAIL_PASSWORD are correct
- Ensure 2FA is enabled on Gmail account

### Preview emails in development
- Without actual email service, check console logs
- Look for "Preview URL:" to view test emails in browser

## Production Setup

For production, consider using:
- **SendGrid** (Free tier: 100 emails/day)
- **AWS SES** (Amazon Simple Email Service)
- **Mailgun**
- **Postmark**

Update `backend/services/emailService.js` to use your preferred service.

