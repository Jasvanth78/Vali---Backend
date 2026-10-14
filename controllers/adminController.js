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
  try { require('../utils/appBranding').validateBranding(key, ta, en); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (key === 'home_layout' || key === 'home_weather_location') {
    try { require('../utils/homeContent').validateHomeContent(key, en); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  if (key === 'home_hero_slider') {
    try {
      require('../utils/heroSlider').validateHeroSlider(en);
      if (ta !== en) throw new Error('Slider configuration must be identical in both content fields.');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
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

const sendPushNotificationToAll = async (title, body, context = {}) => {
  try { return await require('../services/notificationService').notificationService().dispatch({ definitionKey: 'general', title, message: body, audience: { kind: 'all' }, idempotencyKey: context.idempotencyKey || require('node:crypto').randomUUID(), ...context }); }
  catch (error) { console.error('Notification dispatch unavailable:', error.code || 'service_error'); }
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
    
    // newUsers: registered today
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    const newUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const activeUsers = await prisma.user.count({
      where: {
        NOT: { fcmToken: null }
      }
    });

    const topRasisRaw = await prisma.user.groupBy({
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
    
    const topRasis = topRasisRaw.filter(r => r.rasi !== null);
    
    const rasiMap = {
      'Mesham': 'Aries', 'Rishabam': 'Taurus', 'Midhunam': 'Gemini', 'Kadagam': 'Cancer',
      'Simmam': 'Leo', 'Kanni': 'Virgo', 'Thulaam': 'Libra', 'Viruchigam': 'Scorpio',
      'Dhanusu': 'Sagittarius', 'Magaram': 'Capricorn', 'Kumbam': 'Aquarius', 'Meenam': 'Pisces'
    };

    let mostSelectedRasi = 'None';
    if (topRasis.length > 0 && topRasis[0].rasi) {
       const eng = rasiMap[topRasis[0].rasi] || topRasis[0].rasi;
       mostSelectedRasi = `${topRasis[0].rasi} (${eng})`;
    }

    const dailyPredictions = await prisma.rasiPalan.count({
      where: { type: 'daily' }
    });

    res.json({
      totalUsers,
      activeUsers,
      newUsers,
      mostSelectedRasi,
      dailyPredictions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const sendPushNotificationToRasi = async (targetRasi, title, body, eventId) => {
  try { return await require('../services/notificationService').notificationService().event('rasi_published', eventId || require('node:crypto').randomUUID(), { rasi: targetRasi }, { rasi: targetRasi }, { kind: 'rasi', rasi: targetRasi }); }
  catch (error) { console.error('Rasi notification dispatch unavailable:', error.code || 'service_error'); }
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
      `உங்கள் ${rasi} ராசிக்கான ${type} பலன்கள் வெளியிடப்பட்டுள்ளன!`,
      palan.id
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
    sunset, moonrise, moonset, 
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
        moonrise: moonrise === undefined ? undefined : moonrise || null,
        moonset: moonset === undefined ? undefined : moonset || null,
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
    sunset, moonrise, moonset, 
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
        moonrise: moonrise === undefined ? undefined : moonrise || null,
        moonset: moonset === undefined ? undefined : moonset || null,
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
  const { date, time, type, description, month, thithi, natchathiram, yogam, lagnam } = req.body;
  try {
    const mugurtham = await prisma.mugurtham.create({
      data: { date: new Date(date), time, type, description, month, thithi, natchathiram, yogam, lagnam },
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
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided for bulk upload' });
    }

    let processedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of data) {
        const { rasi, type, content, date } = item;
        
        if (!rasi || !type || !content || !date) {
          throw new Error(`Missing required fields for rasi: ${rasi || 'Unknown'}`);
        }

        const recordDate = new Date(date);
        
        const startOfDay = new Date(recordDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        
        const endOfDay = new Date(recordDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // Delete existing records for the same day, rasi, and type to prevent duplicates
        await tx.rasiPalan.deleteMany({
          where: {
            rasi,
            type,
            date: {
              gte: startOfDay,
              lte: endOfDay
            }
          }
        });

        // Create the new record
        await tx.rasiPalan.create({
          data: {
            rasi,
            type,
            content,
            date: recordDate
          }
        });
        processedCount++;
      }
    }, {
      maxWait: 5000, // wait up to 5 seconds to get a connection
      timeout: 30000 // 30 second timeout to complete the transaction
    });
    const uniqueRasis = [...new Set(data.map(item => item.rasi).filter(Boolean))];
    for (const rasi of uniqueRasis) {
      sendPushNotificationToRasi(
        rasi,
        "தினசரி ராசி பலன் 🌅",
        `உங்கள் ${rasi} ராசிக்கான பலன்கள் வெளியிடப்பட்டுள்ளன!`,
        require('node:crypto').createHash('sha256').update(JSON.stringify(data) + rasi).digest('hex')
      );
    }
    
    emitLiveUpdate('rasi_palan_updated', { bulk: true, count: processedCount });

    res.status(201).json({ message: `Successfully processed ${processedCount} records.`, count: processedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



const bulkCreatePanchangam = async (req, res) => {
  const { data } = req.body;
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided for bulk upload' });
    }

    let processedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of data) {
        const { date, sunrise, sunset, moonrise, moonset, tithi, nakshatram, yogam, karanam, details, nallaNeram, gowriNallaNeram, rahuKalam, yemagandam, kuligai } = item;
        const recordDate = new Date(date);
        const startOfDay = new Date(recordDate); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(recordDate); endOfDay.setUTCHours(23, 59, 59, 999);

        await tx.panchangam.deleteMany({ where: { date: { gte: startOfDay, lte: endOfDay } } });

        await tx.panchangam.create({
          data: {
            date: recordDate, sunrise, sunset, moonrise: moonrise || null, moonset: moonset || null, tithi: tithi || null, nakshatram: nakshatram || null, yogam: yogam || null, karanam: karanam || null, details: details || '', nallaNeram: nallaNeram || null, gowriNallaNeram: gowriNallaNeram || null, rahuKalam: rahuKalam || null, yemagandam: yemagandam || null, kuligai: kuligai || null
          }
        });
        processedCount++;
      }
    }, {
      maxWait: 10000,
      timeout: 60000
    });

    emitLiveUpdate('panchangam_updated', { bulk: true, count: processedCount });
    res.status(201).json({ message: `Successfully processed ${processedCount} records.`, count: processedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const bulkCreateFestival = async (req, res) => {
  const { data } = req.body;
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided for bulk upload' });
    }
    let processedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of data) {
        const { name, date, description, imageUrl } = item;
        const recordDate = new Date(date);
        const startOfDay = new Date(recordDate); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(recordDate); endOfDay.setUTCHours(23, 59, 59, 999);

        // Optional: delete existing festival with same name on same date
        await tx.festival.deleteMany({ where: { date: { gte: startOfDay, lte: endOfDay }, name } });

        await tx.festival.create({
          data: { name, date: recordDate, description: description || null, imageUrl: imageUrl || null }
        });
        processedCount++;
      }
    }, {
      maxWait: 10000,
      timeout: 60000
    });

    emitLiveUpdate('festivals_updated', { bulk: true, count: processedCount });
    res.status(201).json({ message: `Successfully processed ${processedCount} records.`, count: processedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const bulkCreateMugurtham = async (req, res) => {
  const { data } = req.body;
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided for bulk upload' });
    }
    let processedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of data) {
        const { date, time, type, description, month, thithi, natchathiram, yogam, lagnam } = item;
        const recordDate = new Date(date);
        const startOfDay = new Date(recordDate); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(recordDate); endOfDay.setUTCHours(23, 59, 59, 999);

        await tx.mugurtham.deleteMany({ where: { date: { gte: startOfDay, lte: endOfDay } } });

        await tx.mugurtham.create({
          data: { date: recordDate, time, type, description: description || null, month, thithi, natchathiram, yogam, lagnam }
        });
        processedCount++;
      }
    }, {
      maxWait: 10000,
      timeout: 60000
    });

    emitLiveUpdate('mugurtham_updated', { bulk: true, count: processedCount });
    res.status(201).json({ message: `Successfully processed ${processedCount} records.`, count: processedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const bulkCreateNallaNeram = async (req, res) => {
  const { data } = req.body;
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided for bulk upload' });
    }
    let processedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of data) {
        const { date, morning, evening, gowriMorning, gowriEvening, rahuKalam, yemagandam, kuligai } = item;
        const recordDate = new Date(date);
        const startOfDay = new Date(recordDate); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(recordDate); endOfDay.setUTCHours(23, 59, 59, 999);

        await tx.nallaNeram.deleteMany({ where: { date: { gte: startOfDay, lte: endOfDay } } });

        await tx.nallaNeram.create({
          data: {
            date: recordDate, morning, evening, gowriMorning: gowriMorning || null, gowriEvening: gowriEvening || null, rahuKalam: rahuKalam || null, yemagandam: yemagandam || null, kuligai: kuligai || null
          }
        });
        processedCount++;
      }
    }, {
      maxWait: 10000,
      timeout: 60000
    });

    emitLiveUpdate('nalla_neram_updated', { bulk: true, count: processedCount });
    res.status(201).json({ message: `Successfully processed ${processedCount} records.`, count: processedCount });
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
  try {
    const service = require('../services/notificationService').notificationService();
    const { title, body, target, rasi } = req.body;
    const audience = target === 'all' ? { kind: 'all' } : { kind: 'rasi', rasi: rasi || target };
    const campaign = await service.save('campaigns', { definitionKey: 'general', title, message: body, audience, destination: 'home', parameters: {}, status: 'draft', isEnabled: true, requestId: req.headers['idempotency-key'] || require('node:crypto').randomUUID() });
    const result = await service.sendCampaign(campaign.id);
    res.json({ message: 'Notification request processed. Accepted by FCM does not guarantee device delivery.', ...result, successCount: result.accepted || 0, failureCount: result.failed || 0 });
  } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Notification service unavailable' }); }
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
  const { date, time, type, description, month, thithi, natchathiram, yogam, lagnam } = req.body;
  try {
    const updated = await prisma.mugurtham.update({
      where: { id },
      data: { date: new Date(date), time, type, description, month, thithi, natchathiram, yogam, lagnam },
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
  const { titleTa, titleEn, categoryTa, categoryEn, contentTa, contentEn, author, imageUrl, image, sendNotification, audioUrl } = req.body;
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
        imageUrl: finalImage,
        audioUrl: audioUrl || null
      }
    });

    if (sendNotification !== false) {
      const blogTitle = titleTa || titleEn || '';
      require('../services/notificationService').notificationService().event('article_published', blog.id, { article_title: blogTitle }, { articleId: blog.id }).catch(() => console.error('Notification service unavailable'));
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
  const { titleTa, titleEn, categoryTa, categoryEn, contentTa, contentEn, author, imageUrl, audioUrl } = req.body;
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
        imageUrl: imageUrl || null,
        audioUrl: audioUrl || null
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

// --- VASTU SASTHIRAM CONTROLLERS ---
const getAllVastuSasthiram = async (req, res) => {
  try {
    const vastuList = await prisma.vastuSasthiram.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(vastuList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createVastuSasthiram = async (req, res) => {
  const { titleTa, titleEn, contentTa, contentEn, imageUrl } = req.body;
  try {
    const vastu = await prisma.vastuSasthiram.create({
      data: {
        titleTa,
        titleEn: titleEn || null,
        contentTa,
        contentEn: contentEn || null,
        imageUrl: imageUrl || null
      }
    });
    emitLiveUpdate('vastu_created', vastu);
    res.status(201).json({ message: 'Vastu article created successfully', vastu });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateVastuSasthiram = async (req, res) => {
  const { id } = req.params;
  const { titleTa, titleEn, contentTa, contentEn, imageUrl } = req.body;
  try {
    const vastu = await prisma.vastuSasthiram.update({
      where: { id },
      data: {
        titleTa,
        titleEn: titleEn || null,
        contentTa,
        contentEn: contentEn || null,
        imageUrl: imageUrl || null
      }
    });
    emitLiveUpdate('vastu_updated', vastu);
    res.json({ message: 'Vastu article updated successfully', vastu });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteVastuSasthiram = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.vastuSasthiram.delete({ where: { id } });
    emitLiveUpdate('vastu_deleted', { id });
    res.json({ message: 'Vastu article deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAllVastuSasthiram = async (req, res) => {
  try {
    await prisma.vastuSasthiram.deleteMany({});
    emitLiveUpdate('vastu_deleted_all', {});
    res.json({ message: 'All Vastu articles deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- SAKUNAM CONTROLLERS ---
const getAllSakunam = async (req, res) => {
  try {
    const sakunamList = await prisma.sakunam.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(sakunamList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createSakunam = async (req, res) => {
  const { category, titleTa, titleEn, contentTa, contentEn, imageUrl } = req.body;
  try {
    const sakunam = await prisma.sakunam.create({
      data: {
        category,
        titleTa,
        titleEn: titleEn || null,
        contentTa,
        contentEn: contentEn || null,
        imageUrl: imageUrl || null
      }
    });
    emitLiveUpdate('sakunam_created', sakunam);
    res.status(201).json({ message: 'Sakunam entry created successfully', sakunam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSakunam = async (req, res) => {
  const { id } = req.params;
  const { category, titleTa, titleEn, contentTa, contentEn, imageUrl } = req.body;
  try {
    const sakunam = await prisma.sakunam.update({
      where: { id },
      data: {
        category,
        titleTa,
        titleEn: titleEn || null,
        contentTa,
        contentEn: contentEn || null,
        imageUrl: imageUrl || null
      }
    });
    emitLiveUpdate('sakunam_updated', sakunam);
    res.json({ message: 'Sakunam entry updated successfully', sakunam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteSakunam = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.sakunam.delete({ where: { id } });
    emitLiveUpdate('sakunam_deleted', { id });
    res.json({ message: 'Sakunam entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAllSakunam = async (req, res) => {
  try {
    await prisma.sakunam.deleteMany({});
    emitLiveUpdate('sakunam_deleted_all', {});
    res.json({ message: 'All Sakunam entries deleted' });
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
      const eventTitle = titleTa || titleEn || '';
      require('../services/notificationService').notificationService().event('event_created', event.id, { event_title: eventTitle }, {}).catch(() => console.error('Notification service unavailable'));
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
  await require('../services/notificationService').notificationService().tick();
};


const deleteAllRasiPalan = async (req, res) => { try { await prisma.rasiPalan.deleteMany({}); res.json({ message: 'All Rasi Palan records deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const deleteAllPanchangam = async (req, res) => { try { await prisma.panchangam.deleteMany({}); res.json({ message: 'All Panchangam records deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const deleteAllNallaNeram = async (req, res) => { try { await prisma.nallaNeram.deleteMany({}); res.json({ message: 'All Nalla Neram records deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const deleteAllFestival = async (req, res) => { try { await prisma.festival.deleteMany({}); res.json({ message: 'All Festival records deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const deleteAllMugurtham = async (req, res) => { try { await prisma.mugurtham.deleteMany({}); res.json({ message: 'All Mugurtham records deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const deleteAllBlogs = async (req, res) => { try { await prisma.blog.deleteMany({}); res.json({ message: 'All Blogs deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const deleteAllEvents = async (req, res) => { try { await prisma.event.deleteMany({}); res.json({ message: 'All Events deleted successfully' }); } catch (error) { res.status(500).json({ error: error.message }); } };
const getAdmins = async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      select: { id: true, email: true },
    });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.admin.create({
      data: { email, password: hashedPassword },
    });
    res.status(201).json({ message: 'Admin created successfully', id: newAdmin.id, email: newAdmin.email });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: error.message });
  }
};

const deleteAdmin = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.admin.delete({ where: { id } });
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  deleteAllRasiPalan,
  deleteAllPanchangam,
  deleteAllNallaNeram,
  deleteAllFestival,
  deleteAllMugurtham,
  deleteAllBlogs,
  deleteAllEvents, 
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
  bulkCreatePanchangam,
  bulkCreateFestival,
  bulkCreateMugurtham,
  bulkCreateNallaNeram,
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
  sendDailyMorningNotification,
  getAdmins,
  createAdmin,
  deleteAdmin,
  getAllVastuSasthiram,
  createVastuSasthiram,
  updateVastuSasthiram,
  deleteVastuSasthiram,
  deleteAllVastuSasthiram,
  getAllSakunam,
  createSakunam,
  updateSakunam,
  deleteSakunam,
  deleteAllSakunam
};
