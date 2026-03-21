const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/auth');
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../server-debug.log');
const admin = require('../utils/firebase');

const prisma = new PrismaClient();

const sendPushNotificationToAll = async (title, body) => {
  try {
    const users = await prisma.user.findMany({
      where: { NOT: { fcmToken: null } },
      select: { fcmToken: true }
    });

    const tokens = users.map(u => u.fcmToken).filter(t => t);
    if (tokens.length === 0) return;

    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Successfully sent ${response.successCount} notifications.`);
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
};

const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (admin && (await bcrypt.compare(password, admin.password))) {
      res.json({
        _id: admin.id,
        email: admin.email,
        token: generateToken(admin.id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const topRasis = await prisma.user.groupBy({
      by: ['rasi'],
      _count: {
        rasi: true,
      },
      orderBy: {
        _count: {
          rasi: 'desc',
        },
      },
      take: 5,
    });

    res.json({
      totalUsers,
      topRasis,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Rasi Palan CRUD
const createRasiPalan = async (req, res) => {
  const { rasi, type, content, date } = req.body;
  try {
    const palan = await prisma.rasiPalan.create({
      data: { rasi, type, content, date: new Date(date) },
    });

    // Send notification
    sendPushNotificationToAll(
      "New Celestial Guidance",
      `Your ${type} prediction for ${rasi} is now available!`
    );

    res.status(201).json(palan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllRasiPalan = async (req, res) => {
  try {
    const palans = await prisma.rasiPalan.findMany();
    res.json(palans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Panchangam CRUD
const createPanchangam = async (req, res) => {
  const { date, sunrise, sunset, details } = req.body;
  try {
    const panchangam = await prisma.panchangam.create({
      data: { date: new Date(date), sunrise, sunset, details },
    });
    res.status(201).json(panchangam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllPanchangam = async (req, res) => {
  try {
    const list = await prisma.panchangam.findMany();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Festival CRUD
const createFestival = async (req, res) => {
  const { name, date, description } = req.body;
  try {
    const festival = await prisma.festival.create({
      data: { name, date: new Date(date), description },
    });
    res.status(201).json(festival);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllFestivals = async (req, res) => {
  try {
    const list = await prisma.festival.findMany();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    fs.appendFileSync(logFile, `Controller Error: ${error.message}\n${error.stack}\n`);
    res.status(500).json({ error: error.message });
  }
};

// Mugurtham CRUD
const createMugurtham = async (req, res) => {
  const { date, time, type, description } = req.body;
  try {
    const mugurtham = await prisma.mugurtham.create({
      data: { date: new Date(date), time, type, description },
    });
    res.status(201).json(mugurtham);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllMugurtham = async (req, res) => {
  try {
    const list = await prisma.mugurtham.findMany();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Nalla Neram CRUD
const createNallaNeram = async (req, res) => {
  const { date, morning, evening } = req.body;
  try {
    const nallaNeram = await prisma.nallaNeram.create({
      data: { date: new Date(date), morning, evening },
    });
    res.status(201).json(nallaNeram);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const bulkCreateRasiPalan = async (req, res) => {
  const { data } = req.body; // Expecting an array of objects
  try {
    const palans = await prisma.rasiPalan.createMany({
      data: data.map(item => ({
        ...item,
        date: new Date(item.date)
      }))
    });

    sendPushNotificationToAll(
      "Daily Updates",
      "Fresh Rasi Palan predictions have been uploaded for all signs!"
    );

    res.status(201).json({ message: `Successfully added ${palans.count} records.`, count: palans.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllNallaNeram = async (req, res) => {
  try {
    const list = await prisma.nallaNeram.findMany();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  adminLogin, 
  getDashboardStats, 
  createRasiPalan, 
  getAllRasiPalan, 
  createPanchangam, 
  getAllPanchangam, 
  createFestival, 
  getAllFestivals, 
  createMugurtham,
  getAllMugurtham,
  createNallaNeram,
  getAllNallaNeram,
  bulkCreateRasiPalan,
  getAllUsers 
};
