const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../logs/error.log');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, 
    pass: process.env.SMTP_PASS, 
  },
});

const sendThankYouEmail = async (userEmail, userName) => {
  try {
    if (!process.env.SMTP_USER) return; // Skip if not configured
    await transporter.sendMail({
      from: `"Valikatti Support" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject: 'Thank you for contacting us!',
      text: `Hi ${userName},\n\nThank you for reaching out to us. We have received your message and will get back to you shortly.\n\nBest Regards,\nValikatti Team`,
    });
  } catch (error) {
    if (fs.existsSync(logFile)) fs.appendFileSync(logFile, `Mailer Error (Thank You): ${error.message}\n${error.stack}\n`);
  }
};

const sendAdminNotification = async (adminEmails, contactMessage) => {
  try {
    if (!process.env.SMTP_USER || !adminEmails || adminEmails.length === 0) return;
    await transporter.sendMail({
      from: `"Valikatti System" <${process.env.SMTP_USER}>`,
      to: adminEmails.join(','),
      subject: 'New Contact Us Message Received',
      text: `A new message has been submitted via the Contact Us form:\n\nName: ${contactMessage.name}\nEmail: ${contactMessage.email}\nMessage: ${contactMessage.content}\n\nPlease reply to the user if necessary.`,
    });
  } catch (error) {
    if (fs.existsSync(logFile)) fs.appendFileSync(logFile, `Mailer Error (Admin Notification): ${error.message}\n${error.stack}\n`);
  }
};

const sendAccountDeletionEmail = async (userEmail, adminEmails) => {
  try {
    if (!process.env.SMTP_USER) return;
    
    // Send to user
    await transporter.sendMail({
      from: `"Valikatti Support" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject: 'Account Deleted Successfully',
      text: `Hi,\n\nYour account has been permanently deleted from our system as requested. We are sorry to see you go.\n\nBest Regards,\nValikatti Team`,
    });

    // Send to admins
    if (adminEmails && adminEmails.length > 0) {
      await transporter.sendMail({
        from: `"Valikatti System" <${process.env.SMTP_USER}>`,
        to: adminEmails.join(','),
        subject: 'User Account Deleted',
        text: `A user has deleted their account.\n\nEmail: ${userEmail}\n\nNo action is required.`,
      });
    }
  } catch (error) {
    if (fs.existsSync(logFile)) fs.appendFileSync(logFile, `Mailer Error (Account Deletion): ${error.message}\n${error.stack}\n`);
  }
};

module.exports = {
  sendThankYouEmail,
  sendAdminNotification,
  sendAccountDeletionEmail
};
