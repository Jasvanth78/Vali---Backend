const express = require('express');
const { notificationService } = require('../services/notificationService');
const { adminAuth } = require('../utils/posterAuth');
const v = require('../utils/notificationValidation');
function createNotificationRouters({ service = notificationService(), auth = adminAuth, uploader = require('./uploadRoutes') } = {}) {
  const adminRouter = express.Router(), deviceRouter = express.Router();
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || (error.code === 11000 ? 409 : 503)).json({ error: error.status ? error.message : error.code === 11000 ? 'This key already exists' : 'Notification service unavailable. Please retry.' }); } };
  adminRouter.use(auth); adminRouter.use('/upload', uploader);
  adminRouter.get('/dashboard', wrap(async (_, res) => res.json(await service.dashboard())));
  adminRouter.put('/global', wrap(async (req, res) => res.json(await service.global(req.body.isEnabled))));
  adminRouter.post('/estimate', wrap(async (req, res) => {
    const definition = await (await service.collection('definitions')).findOne({ key: req.body.definitionKey });
    if (!definition) v.fail('Select a notification type');
    res.json({ count: (await service.recipients(v.audience(req.body.audience), definition.categoryKey)).length, allowed: !!await service.allowed(definition.key) });
  }));
  adminRouter.get('/recipients', wrap(async (req, res) => {
    const db = await service.dbProvider();
    const q = String(req.query.q || '').slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await db.collection('User').find({ fcmToken: { $type: 'string', $ne: '' }, ...(q ? { $or: [{ email: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }] } : {}) }, { projection: { name: 1, email: 1, rasi: 1 } }).limit(100).toArray();
    res.json(users.map(user => ({ id: user._id.toString(), name: user.name, email: user.email, rasi: user.rasi })));
  }));
  adminRouter.get('/legacy-history', wrap(async (req, res) => {
    const db = await service.dbProvider(), page = Math.max(1, Number(req.query.page) || 1);
    const filter = { runId: { $exists: false } };
    if (req.query.q) { const q = String(req.query.q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ title: { $regex: q, $options: 'i' } }, { message: { $regex: q, $options: 'i' } }, { target: { $regex: q, $options: 'i' } }]; }
    if (req.query.from || req.query.to) { filter.createdAt = {}; if (req.query.from) filter.createdAt.$gte = new Date(req.query.from); if (req.query.to) filter.createdAt.$lte = new Date(req.query.to); if ([filter.createdAt.$gte, filter.createdAt.$lte].some(date => date && !Number.isFinite(date.getTime()))) v.fail('Invalid date filter'); }
    const items = await db.collection('Notification').find(filter).sort({ createdAt: -1 }).skip((page - 1) * 30).limit(30).toArray();
    res.json({ items: items.map(service.publicRecord), total: await db.collection('Notification').countDocuments(filter), page });
  }));
  adminRouter.post('/templates/preview', wrap(async (req, res) => res.json({ title: v.render(v.validateTemplate(v.text(req.body.title, 200)), req.body.variables || {}), message: v.render(v.validateTemplate(v.text(req.body.message, 1000)), req.body.variables || {}) })));
  adminRouter.get('/logs/:id/attempts', wrap(async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) v.fail('Invalid record ID');
    const rows = await (await service.collection('attempts')).find(
      { runId: new (require('mongodb').ObjectId)(req.params.id) },
      { projection: { tokenHash: 0, deviceId: 0, userId: 0 } },
    ).sort({ createdAt: -1 }).limit(500).toArray();
    res.json(rows.map(service.publicRecord));
  }));
  for (const resource of ['categories', 'definitions', 'rules', 'templates', 'segments', 'campaigns', 'logs']) {
    adminRouter.get(`/${resource}`, wrap(async (req, res) => res.json(await service.list(resource, req.query))));
    if (resource === 'logs') continue;
    adminRouter.post(`/${resource}`, wrap(async (req, res) => res.status(201).json(await service.save(resource, req.body))));
    adminRouter.put(`/${resource}/:id`, wrap(async (req, res) => res.json(await service.save(resource, req.body, req.params.id))));
    adminRouter.patch(`/${resource}/:id/status`, wrap(async (req, res) => res.json(await service.status(resource, req.params.id, req.body))));
    adminRouter.delete(`/${resource}/:id`, wrap(async (req, res) => res.json(await service.archive(resource, req.params.id))));
  }
  adminRouter.post('/campaigns/:id/send', wrap(async (req, res) => res.json(await service.sendCampaign(req.params.id, false))));
  adminRouter.post('/campaigns/:id/test', wrap(async (req, res) => res.json(await service.sendCampaign(req.params.id, true))));
  deviceRouter.post('/devices', wrap(async (req, res) => res.json(await service.deviceRegister(req.body))));
  const deviceAuth = async (req, res, next) => { try { req.notificationDevice = await service.verifyDevice(req.headers['x-notification-device'], req.headers.authorization?.replace(/^Bearer /, '')); next(); } catch (error) { res.status(error.status || 401).json({ error: 'Device authorization required' }); } };
  deviceRouter.get('/preferences', deviceAuth, wrap(async (req, res) => res.json(await service.preferences(req.notificationDevice))));
  deviceRouter.put('/preferences', deviceAuth, wrap(async (req, res) => res.json(await service.preferences(req.notificationDevice, req.body))));
  deviceRouter.post('/opened/:id', deviceAuth, wrap(async (req, res) => res.json(await service.opened(req.notificationDevice, req.params.id))));
  return { adminRouter, deviceRouter };
}
module.exports = { createNotificationRouters };
