const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { adminAuth } = require('../utils/posterAuth');
const { database } = require('../services/notificationStore');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100000 } });
router.use(adminAuth);
router.get('/', async (_, res) => {
  try { res.json(await (await database()).collection('notification_icon_assets').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(100).toArray()); }
  catch (_) { res.status(503).json({ error: 'Could not load uploaded icons.' }); }
});
router.post('/', upload.single('image'), async (req, res) => {
  let filename;
  try {
    const bytes = req.file?.buffer;
    if (!bytes || bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16) !== 96 || bytes.readUInt32BE(20) !== 96) {
      return res.status(400).json({ error: 'Upload a normalized 96 x 96 PNG notification icon.' });
    }
    const directory = path.resolve(__dirname, '../uploads/notification-icons');
    await fs.mkdir(directory, { recursive: true });
    const id = crypto.randomUUID();
    filename = path.join(directory, `${id}.png`);
    await fs.writeFile(filename, bytes);
    const asset = { id, label: String(req.body.label || 'Custom icon').trim().slice(0, 80) || 'Custom icon', imageUrl: `/uploads/notification-icons/${id}.png`, createdAt: new Date() };
    await (await database()).collection('notification_icon_assets').insertOne({ ...asset });
    res.status(201).json(asset);
  } catch (_) {
    if (filename) await fs.unlink(filename).catch(() => {});
    res.status(503).json({ error: 'Could not save notification icon.' });
  }
});
module.exports = router;
