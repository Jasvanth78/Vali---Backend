require('dotenv').config();
const { sendWelcomeEmail, sendAccountDeletionEmail } = require('./utils/mailer');

async function testEmails() {
  console.log("SMTP_HOST: ", process.env.SMTP_HOST);
  console.log("SMTP_USER: ", process.env.SMTP_USER);

  console.log("Testing Welcome Email...");
  await sendWelcomeEmail('jasvanth112233@gmail.com', 'Jasvanth');
  console.log("Welcome Email sent request complete.");

  console.log("Testing Account Deletion Email...");
  await sendAccountDeletionEmail('jasvanth112233@gmail.com', ['jasvanth112233@gmail.com']);
  console.log("Account Deletion Email sent request complete.");
}

testEmails().catch(console.error);
