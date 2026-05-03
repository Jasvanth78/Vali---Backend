const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/auth');
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../server-debug.log');
const { emitAppContentUpdate } = require('../utils/socket');
const { emitLiveUpdate } = require('../utils/socket');
const admin = require('../utils/firebase');

const prisma = new PrismaClient();

const getAppContent = async (req, res) => {
  try {
    const content = await prisma.appContent.findMany();
    // Convert to a key-value object for easier consumption if preferred, 
    // or just return as is. Let's return as is for now.
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateAppContent = async (req, res) => {
  const { key, ta, en } = req.body;
  try {
    const updated = await prisma.appContent.upsert({
      where: { key },
      update: { ta, en },
      create: { key, ta, en },
    });

    emitAppContentUpdate(updated);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const sendPushNotificationToAll = async (title, body) => {
  try {
    // Check if Firebase Admin SDK is properly initialized
    if (!admin || !admin.messaging) {
      console.error('Firebase Admin SDK not initialized. Cannot send notifications.');
      return;
    }

    const users = await prisma.user.findMany({
      where: { NOT: { fcmToken: null } },
      select: { fcmToken: true, email: true }
    });

    const tokens = users.map(u => u.fcmToken).filter(t => t && t.length > 0);
    if (tokens.length === 0) {
      console.log('No users with valid FCM tokens found. Skipping notification.');
      return;
    }

    console.log(`Sending push notification to ${tokens.length} devices...`);

    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Push notification results: ${response.successCount} success, ${response.failureCount} failed.`);

    // Log failed tokens for debugging
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${idx}: ${resp.error?.message}`);
        }
      });
    }
  } catch (error) {
    console.error('Error sending push notifications:', error.message);
  }
};

const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const adminUser = await prisma.admin.findUnique({ where: { email } });

    if (adminUser && (await bcrypt.compare(password, adminUser.password))) {
      res.json({
        _id: adminUser.id,
        email: adminUser.email,
        token: generateToken(adminUser.id),
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

    // Emit live update to all connected apps
    emitLiveUpdate('rasi_palan_updated', palan);

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
    emitLiveUpdate('panchangam_updated', panchangam);
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
    emitLiveUpdate('festivals_updated', festival);
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
    emitLiveUpdate('mugurtham_updated', mugurtham);
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
    emitLiveUpdate('nalla_neram_updated', nallaNeram);
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
    emitLiveUpdate('rasi_palan_updated', { bulk: true, count: palans.count });

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

const manualSendNotification = async (req, res) => {
  const { title, body, target, rasi } = req.body;
  try {
    // Check if Firebase Admin SDK is properly initialized
    if (!admin || !admin.messaging) {
      return res.status(500).json({ error: 'Firebase Admin SDK not initialized. Check your service account configuration.' });
    }

    let users;
    if (target === 'all') {
      users = await prisma.user.findMany({
        where: { NOT: { fcmToken: null } },
        select: { fcmToken: true }
      });
    } else if (target === 'rasi' && rasi) {
      users = await prisma.user.findMany({
        where: { rasi: rasi, NOT: { fcmToken: null } },
        select: { fcmToken: true }
      });
    } else {
      return res.status(400).json({ error: 'Invalid target or missing rasi' });
    }

    const tokens = users.map(u => u.fcmToken).filter(t => t && t.length > 0);
    if (tokens.length === 0) {
      return res.json({ message: 'No users found with valid tokens for this target.' });
    }

    console.log(`Manual notification: Sending to ${tokens.length} devices. Title: "${title}"`);

    // Save notification to database first
    try {
      await prisma.notification.create({
        data: {
          title,
          message: body,
          target,
          createdAt: new Date(),
        }
      });
    } catch (dbError) {
      console.error('Error saving notification to DB:', dbError.message);
      // Continue with sending the FCM message even if DB saving fails
    }

    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Manual notification results: ${response.successCount} success, ${response.failureCount} failed.`);

    // Log individual failures for debugging
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${idx}: ${resp.error?.code} - ${resp.error?.message}`);
        }
      });
    }

    res.json({ 
      message: `Successfully sent ${response.successCount} of ${tokens.length} notifications.`, 
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTargeted: tokens.length
    });
  } catch (error) {
    console.error('Manual notification error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

const getAppCards = async (req, res) => {
  try {
    const cards = await prisma.appCard.findMany({
      orderBy: { order: 'asc' }
    });
    // If no cards exist yet, return default set
    if (cards.length === 0) {
      const defaults = [
        { key: 'panchangam', titleTa: 'பஞ்சாங்கம்', titleEn: 'Panchangam', imageUrl: null, isEnabled: true, order: 0, screen: 'panchangam' },
        { key: 'nalla_neram', titleTa: 'நல்ல நேரம்', titleEn: 'Nalla Neram', imageUrl: null, isEnabled: true, order: 1, screen: 'nalla_neram' },
        { key: 'mugurtham', titleTa: 'முகூர்த்த நாட்கள்', titleEn: 'Mugurtha Naal', imageUrl: null, isEnabled: true, order: 2, screen: 'mugurtham' },
        { key: 'daily_palan', titleTa: 'தினசரி ராசி பலன்', titleEn: 'Daily Rasi Palan', imageUrl: null, isEnabled: true, order: 3, screen: 'daily_palan' },
        { key: 'weekly_palan', titleTa: 'வாராந்திர ராசி பலன்', titleEn: 'Weekly Rasi Palan', imageUrl: null, isEnabled: true, order: 4, screen: 'weekly_palan' },
        { key: 'monthly_palan', titleTa: 'மாதாந்திர ராசி பலன்', titleEn: 'Monthly Rasi Palan', imageUrl: null, isEnabled: true, order: 5, screen: 'monthly_palan' },
        { key: 'yearly_palan', titleTa: 'ஆண்டு ராசி பலன்', titleEn: 'Yearly Rasi Palan', imageUrl: null, isEnabled: true, order: 6, screen: 'yearly_palan' },
        { key: 'ai_jothidar', titleTa: 'AI ஜோதிடர்', titleEn: 'AI Jothidar', imageUrl: null, isEnabled: true, order: 7, screen: 'ai_jothidar' },
        { key: 'festivals', titleTa: 'பண்டிகைகள்', titleEn: 'Festivals', imageUrl: null, isEnabled: true, order: 8, screen: 'festivals' },
        { key: 'naal_kati', titleTa: 'நாட்காட்டி', titleEn: 'Naal Kati', imageUrl: null, isEnabled: true, order: 9, screen: 'naal_kati' },
      ];
      await prisma.appCard.createMany({ data: defaults });
      return res.json(defaults);
    }
    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const upsertAppCard = async (req, res) => {
  const { id, key, titleTa, titleEn, imageUrl, isEnabled, order, screen } = req.body;
  try {
    let card;
    if (id) {
      card = await prisma.appCard.update({
        where: { id },
        data: { titleTa, titleEn, imageUrl, isEnabled, order, screen }
      });
    } else {
      card = await prisma.appCard.upsert({
        where: { key },
        update: { titleTa, titleEn, imageUrl, isEnabled, order, screen },
        create: { key, titleTa, titleEn, imageUrl, isEnabled: isEnabled ?? true, order: order ?? 0, screen }
      });
    }
    emitLiveUpdate('app_cards_updated', { action: 'upsert', card });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAppCard = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.appCard.delete({ where: { id } });
    emitLiveUpdate('app_cards_updated', { action: 'delete', id });
    res.json({ message: 'Card deleted' });
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
  getAllUsers,
  getAppContent,
  updateAppContent,
  manualSendNotification,
  getAppCards,
  upsertAppCard,
  deleteAppCard
};
