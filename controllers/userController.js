const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { sendThankYouEmail, sendAdminNotification, sendAccountDeletionEmail, sendWelcomeEmail } = require('../utils/mailer');
const logFile = path.join(__dirname, '../server-debug.log');

const loginUser = async (req, res) => {
  const { name, email, fcmToken, dob, tob, pob } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, fcmToken, dob, tob, pob },
      create: { name, email, fcmToken, dob, tob, pob },
    });

    if (!existingUser) {
      sendWelcomeEmail(email, name || 'Friend');
    }

    res.json(user);
  } catch (error) {
    fs.appendFileSync(logFile, `User Controller Error: ${error.message}\n${error.stack}\n`);
    res.status(500).json({ error: error.message });
  }
};

const getUserProfile = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const selectRasi = async (req, res) => {
  const { email, rasi } = req.body;

  try {
    const user = await prisma.user.update({
      where: { email },
      data: { rasi },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getRasiPalan = async (req, res) => {
  const { rasi, type } = req.query; // type can be daily, weekly, monthly, yearly

  const rasiMap = {
    'aries': 'Mesham', 'taurus': 'Rishabam', 'gemini': 'Midhunam', 'cancer': 'Kadagam',
    'leo': 'Simmam', 'virgo': 'Kanni', 'libra': 'Thulaam', 'scorpio': 'Viruchigam',
    'sagittarius': 'Dhanusu', 'capricorn': 'Magaram', 'aquarius': 'Kumbam', 'pisces': 'Meenam',
    'mesham': 'Mesham', 'rishabam': 'Rishabam', 'midhunam': 'Midhunam', 'kadagam': 'Kadagam',
    'simmam': 'Simmam', 'kanni': 'Kanni', 'thulaam': 'Thulaam', 'viruchigam': 'Viruchigam',
    'dhanusu': 'Dhanusu', 'magaram': 'Magaram', 'kumbam': 'Kumbam', 'meenam': 'Meenam',
  };

  try {
    const targetType = type || 'daily';
    const canonicalRasi = rasi ? (rasiMap[rasi.toLowerCase()] || rasi) : null;
    const whereClause = { type: targetType };

    if (canonicalRasi) {
      whereClause.rasi = canonicalRasi;
    }

    // Calculate date boundaries based on the target type using Asia/Kolkata timezone
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const localDate = new Date(`${dateStr}T00:00:00.000Z`);

    if (targetType === 'daily') {
      const startOfDay = new Date(localDate);
      const endOfDay = new Date(localDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      whereClause.date = { gte: startOfDay, lte: endOfDay };
    } else if (targetType === 'weekly') {
      const dayOfWeek = localDate.getUTCDay(); // 0 is Sunday, 1 is Monday
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const startOfWeek = new Date(localDate);
      startOfWeek.setUTCDate(localDate.getUTCDate() + diffToMonday);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
      endOfWeek.setUTCHours(23, 59, 59, 999);
      
      whereClause.date = { gte: startOfWeek, lte: endOfWeek };
    } else if (targetType === 'monthly') {
      const startOfMonth = new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), 1));
      const endOfMonth = new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      whereClause.date = { gte: startOfMonth, lte: endOfMonth };
    } else if (targetType === 'yearly') {
      const startOfYear = new Date(Date.UTC(localDate.getUTCFullYear(), 0, 1));
      const endOfYear = new Date(Date.UTC(localDate.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
      whereClause.date = { gte: startOfYear, lte: endOfYear };
    }

    const palan = await prisma.rasiPalan.findFirst({
      where: whereClause,
      orderBy: {
        date: 'desc'
      }
    });

    if (palan) {
      res.json(palan);
    } else {
      res.status(200).json({ content: `No ${targetType} prediction found yet.` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getDailyPanchangam = async (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      const panchangam = await prisma.panchangam.findFirst({
        where: {
          date: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      });
      return res.json(panchangam || {});
    }

    const panchangam = await prisma.panchangam.findFirst({
      orderBy: {
        date: 'desc'
      }
    });

    res.json(panchangam || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getFestivals = async (req, res) => {
  try {
    const festivals = await prisma.festival.findMany({
      orderBy: {
        date: 'asc'
      },
      take: 20
    });
    res.json(festivals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const askAIJothidar = async (req, res) => {
  const { rasi, message, language } = req.body;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const today = new Date().toDateString();
    const systemPrompt = `You are "AI Jothidar", a wise and compassionate astrology expert. 
    Provide guidance based on the user's Rasi: ${rasi} and today's date: ${today}. 
    Keep responses insightful, mystical yet practical.
    IMPORTANT: Respond strictly in ${language === 'ta' ? 'Tamil' : 'English'}.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getMugurtham = async (req, res) => {
  try {
    const mugurtha_naalkal = await prisma.mugurtham.findMany({
      orderBy: {
        date: 'asc'
      },
      take: 20
    });
    res.json(mugurtha_naalkal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getNallaNeram = async (req, res) => {
  try {
    const { upcoming, date } = req.query;
    if (upcoming === 'true') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const list = await prisma.nallaNeram.findMany({
        where: { date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 30
      });
      return res.json(list);
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      const nallaNeram = await prisma.nallaNeram.findFirst({
        where: {
          date: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      });
      return res.json(nallaNeram || {});
    }

    const nallaNeram = await prisma.nallaNeram.findFirst({
      orderBy: { date: 'desc' }
    });
    res.json(nallaNeram);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCalendarEvents = async (req, res) => {
  try {
    const { month } = req.query; // expected format 'YYYY-MM'
    let startDate, endDate;
    
    if (month) {
      const [yearStr, monthStr] = month.split('-');
      startDate = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, 1));
      endDate = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59, 999));
    } else {
      const now = new Date();
      startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
    }

    const [panchangam, nallaNeram, festivals, mugurtham] = await Promise.all([
      prisma.panchangam.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
      prisma.nallaNeram.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
      prisma.festival.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
      prisma.mugurtham.findMany({ where: { date: { gte: startDate, lte: endDate } } })
    ]);

    const grouped = {};
    const addToGroup = (arr, key) => {
      arr.forEach(item => {
        const dateStr = item.date.toISOString().split('T')[0];
        if (!grouped[dateStr]) grouped[dateStr] = {};
        if (!grouped[dateStr][key]) grouped[dateStr][key] = [];
        grouped[dateStr][key].push(item);
      });
    };

    addToGroup(panchangam, 'panchangam');
    addToGroup(nallaNeram, 'nallaNeram');
    addToGroup(festivals, 'festivals');
    addToGroup(mugurtham, 'mugurtham');

    res.json(grouped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const updateUserProfile = async (req, res) => {
  const { originalEmail, name, email, rasi, star, dob, tob, pob } = req.body;

  try {
    if (email !== originalEmail) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { email: originalEmail },
      data: { name, email, rasi, star, dob, tob, pob },
    });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserNotifications = async (req, res) => {
  const { email } = req.params;
  const { rasi: queryRasi } = req.query;

  const rasiMap = {
    'aries': 'Mesham', 'taurus': 'Rishabam', 'gemini': 'Midhunam', 'cancer': 'Kadagam',
    'leo': 'Simmam', 'virgo': 'Kanni', 'libra': 'Thulaam', 'scorpio': 'Viruchigam',
    'sagittarius': 'Dhanusu', 'capricorn': 'Magaram', 'aquarius': 'Kumbam', 'pisces': 'Meenam',
    'mesham': 'Mesham', 'rishabam': 'Rishabam', 'midhunam': 'Midhunam', 'kadagam': 'Kadagam',
    'simmam': 'Simmam', 'kanni': 'Kanni', 'thulaam': 'Thulaam', 'viruchigam': 'Viruchigam',
    'dhanusu': 'Dhanusu', 'magaram': 'Magaram', 'kumbam': 'Kumbam', 'meenam': 'Meenam'
  };

  try {
    let userRasi = null;
    let userCreatedAt = null;
    if (email && email !== 'all') {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        if (user.rasi) {
          userRasi = user.rasi.trim();
        }
        userCreatedAt = user.createdAt;
      }
    }
    if (!userRasi && queryRasi && queryRasi.trim().length > 0) {
      userRasi = queryRasi.trim();
    }

    const canonicalUserRasi = userRasi ? (rasiMap[userRasi.toLowerCase()] || userRasi) : null;

    let notifications = await prisma.notification.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });

    if (notifications.length === 0) {
      const defaults = [
        {
          title: 'வரவேற்கிறோம்! (Welcome to Valikatti)',
          message: 'வழி காட்டி செயலியில் தங்களை அன்போடு வரவேற்கிறோம். தினசரி ராசி பலன் மற்றும் பஞ்சாங்கம் விவரங்களை பார்க்கவும்.',
          target: 'all'
        },
        {
          title: 'இன்றைய பஞ்சாங்கம் நேரலையில் உள்ளது',
          message: 'இன்றைய நல்ல நேரம், ராகு காலம் மற்றும் எமகண்டம் நேரங்கள் புதுப்பிக்கப்பட்டுள்ளன.',
          target: 'all'
        },
        {
          title: 'தினசரி ராசி பலன் (Daily Horoscope)',
          message: 'உங்கள் ராசிக்கான இன்றைய நட்சத்திர பலன்கள் மற்றும் வழிகாட்டுதல்கள் தயாராக உள்ளன.',
          target: 'all'
        }
      ];

      for (const d of defaults) {
        await prisma.notification.create({ data: d });
      }

      notifications = await prisma.notification.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        take: 50
      });
    }

    // Filter notifications based on target (all vs specific rasi) and user creation date
    const filteredNotifications = notifications.filter(n => {
      // Do not show notifications created before the user account
      if (userCreatedAt && new Date(n.createdAt) < new Date(userCreatedAt)) {
        return false;
      }

      const targetRaw = (n.target || 'all').trim();
      const canonicalTarget = rasiMap[targetRaw.toLowerCase()] || targetRaw;
      if (canonicalTarget.toLowerCase() === 'all') return true;
      if (canonicalUserRasi && canonicalTarget.toLowerCase() === canonicalUserRasi.toLowerCase()) return true;
      return false;
    });

    res.json(filteredNotifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteUserAccount = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await prisma.user.delete({
      where: { email },
    });

    const admins = await prisma.admin.findMany();
    const adminEmails = admins.map(admin => admin.email);
    sendAccountDeletionEmail(email, adminEmails);

    res.json({ message: 'User deleted successfully', user });
  } catch (error) {
    fs.appendFileSync(logFile, `Delete User Error: ${error.message}\n${error.stack}\n`);
    res.status(500).json({ error: error.message });
  }
};

const submitContactMessage = async (req, res) => {
  const { name, email, content } = req.body;
  if (!name || !email || !content) {
    return res.status(400).json({ error: 'Name, email, and content are required' });
  }

  try {
    const message = await prisma.contactMessage.create({
      data: { name, email, content },
    });

    const admins = await prisma.admin.findMany();
    const adminEmails = admins.map(admin => admin.email);
    sendThankYouEmail(email, name);
    sendAdminNotification(adminEmails, message);

    res.json({ message: 'Message submitted successfully', data: message });
  } catch (error) {
    fs.appendFileSync(logFile, `Contact Message Error: ${error.message}\n${error.stack}\n`);
    res.status(500).json({ error: 'Failed to submit message' });
  }
};

module.exports = { loginUser, getUserProfile, updateUserProfile, selectRasi, getRasiPalan, getDailyPanchangam, getFestivals, getMugurtham, getNallaNeram, askAIJothidar, getUserNotifications, deleteUserAccount, getCalendarEvents, submitContactMessage };
