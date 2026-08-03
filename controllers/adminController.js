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
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          channelId: 'valikati_high_importance_channel_v2',
          priority: 'high',
          sound: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
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

const sendPushNotificationToRasi = async (targetRasi, title, body) => {
  try {
    if (!admin || !admin.messaging) return;

    const rasiMap = {
      'aries': 'Mesham', 'taurus': 'Rishabam', 'gemini': 'Midhunam', 'cancer': 'Kadagam',
      'leo': 'Simmam', 'virgo': 'Kanni', 'libra': 'Thulaam', 'scorpio': 'Viruchigam',
      'sagittarius': 'Dhanusu', 'capricorn': 'Magaram', 'aquarius': 'Kumbam', 'pisces': 'Meenam',
      'mesham': 'Mesham', 'rishabam': 'Rishabam', 'midhunam': 'Midhunam', 'kadagam': 'Kadagam',
      'simmam': 'Simmam', 'kanni': 'Kanni', 'thulaam': 'Thulaam', 'viruchigam': 'Viruchigam',
      'dhanusu': 'Dhanusu', 'magaram': 'Magaram', 'kumbam': 'Kumbam', 'meenam': 'Meenam'
    };

    const canonicalTarget = rasiMap[targetRasi.toLowerCase()] || targetRasi;
    const targetAliases = Object.keys(rasiMap).filter(k => rasiMap[k].toLowerCase() === canonicalTarget.toLowerCase());
    const possibleValues = Array.from(new Set([
      canonicalTarget,
      targetRasi,
      ...targetAliases,
      ...targetAliases.map(a => a.charAt(0).toUpperCase() + a.slice(1))
    ]));

    const users = await prisma.user.findMany({
      where: {
        rasi: { in: possibleValues },
        NOT: { fcmToken: null }
      },
      select: { fcmToken: true }
    });

    const tokens = users.map(u => u.fcmToken).filter(t => t && t.length > 0);

    // Save notification to database targeting this specific rasi
    try {
      await prisma.notification.create({
        data: {
          title,
          message: body,
          target: canonicalTarget,
          createdAt: new Date(),
        }
      });
    } catch (_) {}

    if (tokens.length === 0) return;

    const message = {
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          channelId: 'valikati_high_importance_channel_v2',
          priority: 'high',
          sound: 'default',
        },
      },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
      tokens: tokens,
    };

    await admin.messaging().sendEachForMulticast(message);
    console.log(`Rasi-targeted notification sent to ${tokens.length} devices for ${canonicalTarget}`);
  } catch (error) {
    console.error('Error sending rasi notification:', error.message);
  }
};

// Rasi Palan CRUD
const createRasiPalan = async (req, res) => {
  const { rasi, type, content, date } = req.body;
  try {
    const palan = await prisma.rasiPalan.create({
      data: { rasi, type, content, date: new Date(date) },
    });

    // Send notification targeting ONLY users of this specific Rasi
    sendPushNotificationToRasi(
      rasi,
      "தினசரி ராசி பலன் 🌅",
      `உங்கள் ${rasi} ராசிக்கான ${type} பலன்கள் வெளியிடப்பட்டுள்ளன!`
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
  const { 
    date, 
    sunrise, 
    sunset, 
    tithi, 
    nakshatram, 
    yogam, 
    karanam, 
    details, 
    nallaNeram, 
    gowriNallaNeram, 
    rahuKalam, 
    yemagandam, 
    kuligai 
  } = req.body;
  try {
    const panchangam = await prisma.panchangam.create({
      data: {
        date: new Date(date),
        sunrise,
        sunset,
        tithi: tithi || null,
        nakshatram: nakshatram || null,
        yogam: yogam || null,
        karanam: karanam || null,
        details: details || '',
        nallaNeram: nallaNeram || null,
        gowriNallaNeram: gowriNallaNeram || null,
        rahuKalam: rahuKalam || null,
        yemagandam: yemagandam || null,
        kuligai: kuligai || null,
      },
    });
    emitLiveUpdate('panchangam_updated', panchangam);
    res.status(201).json(panchangam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updatePanchangam = async (req, res) => {
  const { id } = req.params;
  const { 
    date, 
    sunrise, 
    sunset, 
    tithi, 
    nakshatram, 
    yogam, 
    karanam, 
    details, 
    nallaNeram, 
    gowriNallaNeram, 
    rahuKalam, 
    yemagandam, 
    kuligai 
  } = req.body;
  try {
    const panchangam = await prisma.panchangam.update({
      where: { id },
      data: {
        date: new Date(date),
        sunrise,
        sunset,
        tithi: tithi || null,
        nakshatram: nakshatram || null,
        yogam: yogam || null,
        karanam: karanam || null,
        details: details || '',
        nallaNeram: nallaNeram || null,
        gowriNallaNeram: gowriNallaNeram || null,
        rahuKalam: rahuKalam || null,
        yemagandam: yemagandam || null,
        kuligai: kuligai || null,
      },
    });
    emitLiveUpdate('panchangam_updated', panchangam);
    res.json(panchangam);
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
  const { name, date, description, imageUrl } = req.body;
  try {
    const festival = await prisma.festival.create({
      data: { name, date: new Date(date), description, imageUrl },
    });
    emitLiveUpdate('festivals_updated', festival);
    res.status(201).json(festival);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateFestival = async (req, res) => {
  const { id } = req.params;
  const { name, date, description, imageUrl } = req.body;
  try {
    const festival = await prisma.festival.update({
      where: { id },
      data: { name, date: new Date(date), description, imageUrl },
    });
    emitLiveUpdate('festivals_updated', festival);
    res.json(festival);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllFestivals = async (req, res) => {
  try {
    const list = await prisma.festival.findMany({
      orderBy: { date: 'asc' }
    });
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
  const { date, morning, evening, gowriMorning, gowriEvening, rahuKalam, yemagandam, kuligai } = req.body;
  try {
    const nallaNeram = await prisma.nallaNeram.create({
      data: {
        date: new Date(date),
        morning,
        evening,
        gowriMorning: gowriMorning || null,
        gowriEvening: gowriEvening || null,
        rahuKalam: rahuKalam || null,
        yemagandam: yemagandam || null,
        kuligai: kuligai || null,
      },
    });
    emitLiveUpdate('nalla_neram_updated', nallaNeram);
    res.status(201).json(nallaNeram);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateNallaNeram = async (req, res) => {
  const { id } = req.params;
  const { date, morning, evening, gowriMorning, gowriEvening, rahuKalam, yemagandam, kuligai } = req.body;
  try {
    const nallaNeram = await prisma.nallaNeram.update({
      where: { id },
      data: {
        date: new Date(date),
        morning,
        evening,
        gowriMorning: gowriMorning || null,
        gowriEvening: gowriEvening || null,
        rahuKalam: rahuKalam || null,
        yemagandam: yemagandam || null,
        kuligai: kuligai || null,
      },
    });
    emitLiveUpdate('nalla_neram_updated', nallaNeram);
    res.json(nallaNeram);
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

    const rasiMap = {
      'aries': 'Mesham', 'taurus': 'Rishabam', 'gemini': 'Midhunam', 'cancer': 'Kadagam',
      'leo': 'Simmam', 'virgo': 'Kanni', 'libra': 'Thulaam', 'scorpio': 'Viruchigam',
      'sagittarius': 'Dhanusu', 'capricorn': 'Magaram', 'aquarius': 'Kumbam', 'pisces': 'Meenam',
      'mesham': 'Mesham', 'rishabam': 'Rishabam', 'midhunam': 'Midhunam', 'kadagam': 'Kadagam',
      'simmam': 'Simmam', 'kanni': 'Kanni', 'thulaam': 'Thulaam', 'viruchigam': 'Viruchigam',
      'dhanusu': 'Dhanusu', 'magaram': 'Magaram', 'kumbam': 'Kumbam', 'meenam': 'Meenam'
    };

    let users;
    let canonicalTarget = target;
    const targetRasiInput = (target === 'rasi' || target === 'individual') ? rasi : target;

    if (target === 'all') {
      canonicalTarget = 'all';
      users = await prisma.user.findMany({
        where: { NOT: { fcmToken: null } },
        select: { fcmToken: true }
      });
    } else if (targetRasiInput && targetRasiInput.trim().length > 0) {
      canonicalTarget = rasiMap[targetRasiInput.toLowerCase()] || targetRasiInput;
      const targetAliases = Object.keys(rasiMap).filter(k => rasiMap[k].toLowerCase() === canonicalTarget.toLowerCase());
      const possibleValues = Array.from(new Set([
        canonicalTarget,
        targetRasiInput,
        ...targetAliases,
        ...targetAliases.map(a => a.charAt(0).toUpperCase() + a.slice(1))
      ]));

      users = await prisma.user.findMany({
        where: {
          rasi: { in: possibleValues },
          NOT: { fcmToken: null }
        },
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
          target: target === 'rasi' ? canonicalTarget : target,
          createdAt: new Date(),
        }
      });
    } catch (dbError) {
      console.error('Error saving notification to DB:', dbError.message);
      // Continue with sending the FCM message even if DB saving fails
    }

    const message = {
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          channelId: 'valikati_high_importance_channel_v2',
          priority: 'high',
          sound: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
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

const updateRasiPalan = async (req, res) => {
  const { id } = req.params;
  const { rasi, type, content, date } = req.body;
  try {
    const updated = await prisma.rasiPalan.update({
      where: { id },
      data: { rasi, type, content, date: new Date(date) },
    });
    emitLiveUpdate('rasi_palan_updated', updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteRasiPalan = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.rasiPalan.delete({ where: { id } });
    emitLiveUpdate('rasi_palan_updated', { action: 'delete', id });
    res.json({ message: 'Prediction deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deletePanchangam = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.panchangam.delete({ where: { id } });
    emitLiveUpdate('panchangam_updated', { action: 'delete', id });
    res.json({ message: 'Panchangam deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteFestival = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.festival.delete({ where: { id } });
    emitLiveUpdate('festivals_updated', { action: 'delete', id });
    res.json({ message: 'Festival deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteMugurtham = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.mugurtham.delete({ where: { id } });
    emitLiveUpdate('mugurtham_updated', { action: 'delete', id });
    res.json({ message: 'Mugurtham deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMugurtham = async (req, res) => {
  const { id } = req.params;
  const { date, time, type, description } = req.body;
  try {
    const updated = await prisma.mugurtham.update({
      where: { id },
      data: { date: new Date(date), time, type, description },
    });
    emitLiveUpdate('mugurtham_updated', updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteNallaNeram = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.nallaNeram.delete({ where: { id } });
    emitLiveUpdate('nalla_neram_updated', { action: 'delete', id });
    res.json({ message: 'Nalla Neram deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- BLOG CONTROLLERS ---
const getAllBlogs = async (req, res) => {
  try {
    const blogs = await prisma.blog.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createBlog = async (req, res) => {
  const { titleTa, titleEn, categoryTa, categoryEn, contentTa, contentEn, author, imageUrl, image, sendNotification } = req.body;
  try {
    const finalImage = imageUrl || image || null;
    const blogTitle = titleTa || titleEn || 'புதிய பதிவு';

    const blog = await prisma.blog.create({
      data: {
        titleTa,
        titleEn: titleEn || null,
        categoryTa: categoryTa || 'பொது',
        categoryEn: categoryEn || 'General',
        contentTa,
        contentEn: contentEn || null,
        author: author || 'Valikatti Team',
        imageUrl: finalImage
      }
    });

    if (sendNotification !== false) {
      sendPushNotificationToAll(
        'புதிய ஆன்மீகப் பதிவு 📖',
        `புதிய பதிவு: "${blogTitle}". படிக்க உடனே கிளிக் செய்யுங்கள்!`
      );

      try {
        if (prisma.notification) {
          await prisma.notification.create({
            data: {
              title: 'புதிய ஆன்மீகப் பதிவு 📖',
              message: `புதிய பதிவு: "${blogTitle}". படிக்க உடனே கிளிக் செய்யுங்கள்!`,
              target: 'all'
            }
          });
        }
      } catch (dbErr) {
        console.log('Blog notification DB log warning:', dbErr.message);
      }
    }

    emitLiveUpdate('blog_created', blog);

    res.status(201).json({
      message: 'Blog published successfully & saved to database.',
      blog
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateBlog = async (req, res) => {
  const { id } = req.params;
  const { titleTa, titleEn, categoryTa, categoryEn, contentTa, contentEn, author, imageUrl } = req.body;
  try {
    const blog = await prisma.blog.update({
      where: { id },
      data: {
        titleTa,
        titleEn: titleEn || null,
        categoryTa,
        categoryEn,
        contentTa,
        contentEn: contentEn || null,
        author,
        imageUrl: imageUrl || null
      }
    });
    emitLiveUpdate('blog_updated', blog);
    res.json({ message: 'Blog updated successfully', blog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteBlog = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.blog.delete({ where: { id } });
    emitLiveUpdate('blog_deleted', { id });
    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- EVENT CONTROLLERS ---
const getAllEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' }
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createEvent = async (req, res) => {
  const { titleTa, titleEn, date, time, locationTa, locationEn, descriptionTa, descriptionEn, imageUrl, sendNotification } = req.body;
  try {
    const eventTitle = titleTa || titleEn || 'வரவிருக்கும் நிகழ்வு';

    const event = await prisma.event.create({
      data: {
        titleTa,
        titleEn: titleEn || null,
        date: new Date(date),
        time: time || null,
        locationTa: locationTa || null,
        locationEn: locationEn || null,
        descriptionTa: descriptionTa || null,
        descriptionEn: descriptionEn || null,
        imageUrl: imageUrl || null
      }
    });

    if (sendNotification !== false) {
      sendPushNotificationToAll(
        'வரவிருக்கும் ஆன்மீக நிகழ்வு 📅',
        `நிகழ்வு: "${eventTitle}". விரிவான விபரங்களை அறிய கிளிக் செய்யவும்!`
      );

      try {
        if (prisma.notification) {
          await prisma.notification.create({
            data: {
              title: 'வரவிருக்கும் ஆன்மீக நிகழ்வு 📅',
              message: `நிகழ்வு: "${eventTitle}". விரிவான விபரங்களை அறிய கிளிக் செய்யவும்!`,
              target: 'all'
            }
          });
        }
      } catch (dbErr) {
        console.log('Event notification DB log warning:', dbErr.message);
      }
    }

    emitLiveUpdate('event_created', event);

    res.status(201).json({
      message: 'Upcoming Event published successfully',
      event
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateEvent = async (req, res) => {
  const { id } = req.params;
  const { titleTa, titleEn, date, time, locationTa, locationEn, descriptionTa, descriptionEn, imageUrl } = req.body;
  try {
    const event = await prisma.event.update({
      where: { id },
      data: {
        titleTa,
        titleEn: titleEn || null,
        date: new Date(date),
        time: time || null,
        locationTa: locationTa || null,
        locationEn: locationEn || null,
        descriptionTa: descriptionTa || null,
        descriptionEn: descriptionEn || null,
        imageUrl: imageUrl || null
      }
    });
    emitLiveUpdate('event_updated', event);
    res.json({ message: 'Event updated successfully', event });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.event.delete({ where: { id } });
    emitLiveUpdate('event_deleted', { id });
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const sendDailyMorningNotification = async () => {
  try {
    const title = 'இன்றைய ராசி பலன் 🌅';
    const body = 'உங்கள் ராசிக்கான இன்றைய சுப பலன்களைப் பார்க்க உடனே கிளிக் செய்யுங்கள்!';

    await prisma.notification.create({
      data: {
        title,
        message: body,
        target: 'all',
        createdAt: new Date(),
      }
    });

    await sendPushNotificationToAll(title, body);
    console.log('Daily 7:00 AM notification sent successfully.');
  } catch (error) {
    console.error('Error in sendDailyMorningNotification:', error.message);
  }
};

module.exports = { 
  adminLogin, 
  getDashboardStats, 
  createRasiPalan, 
  updateRasiPalan,
  deleteRasiPalan,
  getAllRasiPalan, 
  createPanchangam, 
  updatePanchangam,
  deletePanchangam,
  getAllPanchangam, 
  createFestival, 
  updateFestival,
  deleteFestival,
  getAllFestivals, 
  createMugurtham,
  updateMugurtham,
  deleteMugurtham,
  getAllMugurtham,
  createNallaNeram,
  updateNallaNeram,
  deleteNallaNeram,
  getAllNallaNeram,
  bulkCreateRasiPalan,
  getAllUsers,
  getAppContent,
  updateAppContent,
  manualSendNotification,
  getAppCards,
  upsertAppCard,
  deleteAppCard,
  getAllBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  sendPushNotificationToAll,
  sendDailyMorningNotification
};


