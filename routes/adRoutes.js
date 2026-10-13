const express = require('express');
const { createAdService } = require('../services/adService');
const { adminAuth } = require('../utils/posterAuth');
const { emitLiveUpdate } = require('../utils/socket');
function createAdRouters({ service = createAdService(), auth = adminAuth, emit = emitLiveUpdate } = {}) {
  const publicRouter = express.Router(), adminRouter = express.Router();
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      const status = error.status || (error.code === 'P2002' ? 409 : error.code === 'P2025' ? 404 : 503);
      res.status(status).json({ error: error.status ? error.message : status === 409 ? 'This page placement already has a configuration' : status === 404 ? 'Placement not found' : 'Ad configuration unavailable. Please retry.' });
    }
  };
  const changed = () => emit('ad_config_updated', {});
  publicRouter.get('/', wrap(async (_, res) => { res.set('Cache-Control', 'no-store'); res.json(await service.list(true)); }));
  adminRouter.use(auth);
  adminRouter.get('/', wrap(async (_, res) => res.json(await service.list())));
  adminRouter.put('/settings', wrap(async (req, res) => { const value = await service.saveSettings(req.body); changed(); res.json(value); }));
  adminRouter.post('/', wrap(async (req, res) => { const value = await service.create(req.body); changed(); res.status(201).json(value); }));
  adminRouter.put('/:id', wrap(async (req, res) => { const value = await service.update(req.params.id, req.body); changed(); res.json(value); }));
  adminRouter.patch('/:id/status', wrap(async (req, res) => { const value = await service.status(req.params.id, req.body.isEnabled); changed(); res.json(value); }));
  adminRouter.delete('/:id', wrap(async (req, res) => { await service.remove(req.params.id); changed(); res.json({ deleted: true }); }));
  return { publicRouter, adminRouter };
}
module.exports = { createAdRouters };
