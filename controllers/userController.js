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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const palan = await prisma.rasiPalan.findFirst({
      where: {
        rasi,
        type: type || 'daily',
        date: {
          gte: today,
        },
      },
      orderBy: {
        date: 'desc'
      }
    });

    if (palan) {
      res.json(palan);
    } else {
      res.status(200).json({ content: `No ${type || 'daily'} prediction found for today yet.` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getDailyPanchangam = async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const panchangam = await prisma.panchangam.findFirst({
      where: {
        date: {
          gte: today,
        },
      },
      orderBy: {
        date: 'asc'
      }
    });

    if (panchangam) {
      res.json(panchangam);
    } else {
      res.status(200).json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getFestivals = async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const festivals = await prisma.festival.findMany({
      where: {
        date: {
          gte: today,
        },
      },
      orderBy: {
        date: 'asc'
      },
      take: 10
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const mugurtha_naalkal = await prisma.mugurtham.findMany({
      where: {
        date: {
          gte: today,
        },
      },
      orderBy: {
        date: 'asc'
      },
      take: 10
    });
    res.json(mugurtha_naalkal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getNallaNeram = async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const nalla_neram = await prisma.nallaNeram.findFirst({
      where: {
        date: {
          gte: today,
        },
      },
      orderBy: {
        date: 'asc'
      }
    });

    if (nalla_neram) {
      res.json(nalla_neram);
    } else {
      res.status(200).json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  const { originalEmail, name, email, rasi } = req.body;

  try {
    // If updating email, check if new email already exists (and it's not the same as original)
    if (email !== originalEmail) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { email: originalEmail },
      data: { name, email, rasi },
    });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserNotifications = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { rasi: true }
    });

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { target: 'all' },
          { target: 'rasi', title: { contains: user?.rasi || '' } }, // Fallback logic for rasi targeting
          // Better logic: if we store rasi name in a specific field, use that. 
          // Based on adminController, target is 'all' or 'rasi'.
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    res.json(notifications);
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
