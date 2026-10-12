const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { emitLiveUpdate } = require('../utils/socket');

router.get('/', async (req, res) => {
  try {
    const proverbs = await prisma.proverb.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(proverbs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const proverb = await prisma.proverb.create({
      data: req.body
    });
    emitLiveUpdate('proverbs_updated', { id: proverb.id });
    res.json(proverb);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const proverb = await prisma.proverb.update({
      where: { id: req.params.id },
      data: req.body
    });
    emitLiveUpdate('proverbs_updated', { id: proverb.id });
    res.json(proverb);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.proverb.delete({
      where: { id: req.params.id }
    });
    emitLiveUpdate('proverbs_updated', { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
