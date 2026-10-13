const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { adminAuth } = require('../utils/posterAuth');
function createAdminSessionRouter({ auth = adminAuth, prisma = new PrismaClient() } = {}) {
  const router = express.Router();
  router.get('/', auth, async (req, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.adminId }, select: { id: true, email: true } });
      if (!admin) return res.status(401).json({ message: 'Admin session is no longer valid' });
      res.set('Cache-Control', 'no-store').json(admin);
    } catch (_) { res.status(503).json({ message: 'Could not verify admin session. Please retry.' }); }
  });
  return router;
}
module.exports = { createAdminSessionRouter };
