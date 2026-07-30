const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, '../server-debug.log');

const loginUser = async (req, res) => {
  const { name, email, fcmToken } = req.body;

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, fcmToken },
      create: { name, email, fcmToken },
    });
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

  try {
    const targetType = type || 'daily';
    const whereClause = rasi ? { rasi, type: targetType } : { type: targetType };

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
    const panchangam = await prisma.panchangam.findFirst({
      orderBy: {
        date: 'desc'
      }
    });

    res.json(panchangam || null);
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
    const nalla_neram = await prisma.nallaNeram.findFirst({
      orderBy: {
        date: 'desc'
      }
    });

    res.json(nalla_neram || null);
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

  try {
    let userRasi = null;
    if (email && email !== 'all') {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && user.rasi) {
        userRasi = user.rasi.trim().toLowerCase();
      }
    }

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

    // Filter notifications based on target (all vs specific rasi)
    const filteredNotifications = notifications.filter(n => {
      const target = (n.target || 'all').trim().toLowerCase();
      if (target === 'all') return true;
      if (userRasi && target === userRasi) return true;
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
    res.json({ message: 'User deleted successfully', user });
  } catch (error) {
    fs.appendFileSync(logFile, `Delete User Error: ${error.message}\n${error.stack}\n`);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { loginUser, getUserProfile, updateUserProfile, selectRasi, getRasiPalan, getDailyPanchangam, getFestivals, getMugurtham, getNallaNeram, askAIJothidar, getUserNotifications, deleteUserAccount };
