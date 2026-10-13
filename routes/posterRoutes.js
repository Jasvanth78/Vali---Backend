const express = require('express');
const { createPosterService } = require('../services/posterService');
const auth = require('../utils/posterAuth');
const { emitLiveUpdate } = require('../utils/socket');

function createPosterRouters({ service = createPosterService(), adminAuth = auth.adminAuth, identityAuth = auth.identityAuth, issueSession = auth.issueSession, uploadRouter = require('./uploadRoutes'), emit = emitLiveUpdate } = {}) {
  const publicRouter = express.Router(), adminRouter = express.Router();
  const wrap = fn => async (req, res) => {
    try { await service.ensureSchema(); await fn(req, res); }
    catch (error) { res.status(error.status || (error.code === 11000 ? 409 : 503)).json({ error: error.status ? error.message : 'Poster service unavailable. Please retry.' }); }
  };
  publicRouter.post('/session', async (req, res) => {
    try {
      const { token, identity, actorId, mergeFrom } = await issueSession(req.body || {});
      if (mergeFrom) { await service.ensureSchema(); await service.mergeInteractions(mergeFrom, actorId); }
      res.json({ token, identity });
    }
    catch (_) { res.status(401).json({ error: 'Could not verify poster identity' }); }
  });
  publicRouter.get('/categories', wrap(async (_, res) => res.json(await service.categories())));
  publicRouter.get('/', identityAuth(), wrap(async (req, res) => res.json(await service.list(req.query, req.posterActorId))));
  publicRouter.get('/:id', identityAuth(), wrap(async (req, res) => res.json(await service.get(req.params.id, req.posterActorId))));
  publicRouter.post('/:id/like', identityAuth(true), wrap(async (req, res) => res.json(await service.interact(req.params.id, req.posterActorId, 'like', req.body.liked))));
  publicRouter.post('/:id/bookmark', identityAuth(true), wrap(async (req, res) => res.json(await service.interact(req.params.id, req.posterActorId, 'bookmark', req.body.bookmarked))));
  adminRouter.use(adminAuth);
  // Existing media storage pipeline, behind dedicated poster admin authorization.
  adminRouter.use('/upload', uploadRouter);
  adminRouter.get('/categories', wrap(async (_, res) => res.json(await service.categories())));
  adminRouter.post('/categories', wrap(async (req, res) => { const result = await service.createCategory(req.body); emit('poster_posts_updated', { type: 'categories' }); res.status(201).json(result); }));
  adminRouter.get('/', wrap(async (req, res) => res.json(await service.adminList(req.query))));
  adminRouter.post('/', wrap(async (req, res) => { const result = await service.create(req.body); emit('poster_posts_updated', { id: result.id }); res.status(201).json(result); }));
  adminRouter.put('/:id', wrap(async (req, res) => { const result = await service.update(req.params.id, req.body); emit('poster_posts_updated', { id: result.id }); res.json(result); }));
  adminRouter.delete('/:id', wrap(async (req, res) => { const result = await service.remove(req.params.id); emit('poster_posts_updated', { id: req.params.id, deleted: true }); res.json(result); }));
  return { publicRouter, adminRouter };
}
module.exports = { createPosterRouters };
