const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
require('./utils/firebase');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 7000;

app.use(cors({
  origin: '*', // Allow all origins for dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'server-debug.log');

app.use((req, res, next) => {
  const msg = `${new Date().toISOString()} - ${req.method} ${req.url}\n`;
  fs.appendFileSync(logFile, msg);
  next();
});

// Main Routes
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
  res.json({ message: 'Valikatti API is running...' });
});

app.use((err, req, res, next) => {
  const errorMsg = `${new Date().toISOString()} - ERROR: ${err.message}\n${err.stack}\n`;
  fs.appendFileSync(logFile, errorMsg);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
