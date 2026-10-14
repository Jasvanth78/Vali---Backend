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
const PORT = process.env.PORT || 7006;

app.use(cors({
  origin: '*', // Allow all origins for dev
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Notification-Device', 'Idempotency-Key']
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

// The migrated 7:00 AM rule and all admin schedules use one durable worker.
cron.schedule('* * * * *', () => {
  sendDailyMorningNotification().catch(() => console.error('Notification scheduler unavailable'));
}, { scheduled: true, timezone: 'Asia/Kolkata' });

// Ensure uploads directory exists and serve statically
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Main Routes
app.post('/api/admin/send-notification', require('./utils/posterAuth').adminAuth, require('./controllers/adminController').manualSendNotification);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/session', require('./routes/adminSession').createAdminSessionRouter());
app.use('/api/user', userRoutes);
app.use('/api/special-features', require('./routes/specialFeatureRoutes'));
app.use('/api/upload', uploadRoutes);
app.use('/api/reels', require('./routes/reelsRoutes'));
app.use('/api/govt-holidays', require('./routes/govtHolidays'));
app.use('/api/proverbs', require('./routes/proverbs'));
const posterRouters = require('./routes/posterRoutes').createPosterRouters();
app.use('/api/poster-posts', posterRouters.publicRouter);
app.use('/api/admin/poster-posts', posterRouters.adminRouter);
const adRouters = require('./routes/adRoutes').createAdRouters();
app.use('/api/ad-config', adRouters.publicRouter);
app.use('/api/admin/ad-placements', adRouters.adminRouter);
const notificationRouters = require('./routes/notificationRoutes').createNotificationRouters();
app.use('/api/admin/notifications', notificationRouters.adminRouter);
app.use('/api/admin/notification-icons', require('./routes/notificationIconRoutes'));
app.use('/api/notifications', notificationRouters.deviceRouter);

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

