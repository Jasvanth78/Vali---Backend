const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { emitLiveUpdate } = require('../utils/socket');

router.get('/', async (req, res) => {
  try {
    const holidays = await prisma.govtHoliday.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const holiday = await prisma.govtHoliday.create({
      data: req.body
    });
    emitLiveUpdate('govt_holidays_updated', { id: holiday.id });
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const holiday = await prisma.govtHoliday.update({
      where: { id: req.params.id },
      data: req.body
    });
    emitLiveUpdate('govt_holidays_updated', { id: holiday.id });
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.govtHoliday.delete({
      where: { id: req.params.id }
    });
    emitLiveUpdate('govt_holidays_updated', { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
