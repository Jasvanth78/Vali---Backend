const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
require('./utils/firebase');

const app = express();
app.set('trust proxy', true);
const httpServer = require('http').createServer(app);
const { initSocket } = require('./utils/socket');
initSocket(httpServer);

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*', // Allow all origins for dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'server-debug.log');

app.use((req, res, next) => {
  const msg = `${new Date().toISOString()} - ${req.method} ${req.url}\n`;
  fs.appendFileSync(logFile, msg);
  next();
});

const cron = require('node-cron');
const { sendDailyMorningNotification } = require('./controllers/adminController');

// Schedule daily 7:00 AM IST notification
cron.schedule('0 7 * * *', () => {
  console.log('Cron: Triggering 7:00 AM Daily Morning Rasi Palan notification...');
  sendDailyMorningNotification();
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

// Ensure uploads directory exists and serve statically
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Main Routes
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/special-features', require('./routes/specialFeatureRoutes'));
app.use('/api/upload', uploadRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
  res.json({ message: 'Valikatti API is running...' });
});

app.use((err, req, res, next) => {
  const errorMsg = `${new Date().toISOString()} - ERROR: ${err.message}\n${err.stack}\n`;
  fs.appendFileSync(logFile, errorMsg);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
