const { ObjectId } = require('mongodb');
const crypto = require('node:crypto');
const store = require('./notificationStore');
const v = require('../utils/notificationValidation');
const oid = id => { if (!/^[a-f\d]{24}$/i.test(id || '')) v.fail('Invalid record ID'); return new ObjectId(id); };
const publicRecord = row => row ? { ...row, id: row._id.toString(), _id: undefined, token: undefined, secretHash: undefined } : null;
const rasiAliases = { aries: 'mesham', taurus: 'rishabam', gemini: 'midhunam', cancer: 'kadagam', leo: 'simmam', virgo: 'kanni', libra: 'thulaam', scorpio: 'viruchigam', sagittarius: 'dhanusu', capricorn: 'magaram', aquarius: 'kumbam', pisces: 'meenam' };
const canonicalRasi = value => rasiAliases[String(value).toLowerCase()] || String(value).toLowerCase();

function createNotificationService({ dbProvider = store.database, firebase = () => require('../utils/firebase').messaging(), clock = () => new Date() } = {}) {
  const collection = async name => (await dbProvider()).collection(`notification_${name}`);
  const get = async (name, id) => (await collection(name)).findOne({ _id: oid(id) });
  async function allowed(definitionKey, ruleId, campaignId) {
    const settings = await (await collection('settings')).findOne({ key: 'global' });
    const definition = await (await collection('definitions')).findOne({ key: definitionKey });
    const category = definition && await (await collection('categories')).findOne({ key: definition.categoryKey });
    if (!settings?.isEnabled || !definition?.isEnabled || definition.isArchived || !category?.isEnabled || category.isArchived) return null;
    const rule = ruleId ? await get('rules', ruleId) : null;
    if (ruleId && (!rule?.isEnabled || rule.isArchived)) return null;
    const campaign = campaignId ? await get('campaigns', campaignId) : null;
    if (campaignId && (!campaign?.isEnabled || !['sending', 'queued', 'scheduled'].includes(campaign.status))) return null;
    return { definition, category, rule, campaign };
  }
  async function recipients(audience, categoryKey) {
    const db = await dbProvider();
    const users = await db.collection('User').find({ fcmToken: { $type: 'string', $ne: '' } }, { projection: { fcmToken: 1, name: 1, email: 1, rasi: 1 } }).toArray();
    const devices = await (await collection('devices')).find({}).toArray();
    const preferences = await (await collection('preferences')).find({ categoryKey, isEnabled: false }).toArray();
    const optedOut = new Set(preferences.map(p => p.deviceId));
    let segment;
    if (audience.kind === 'segment') { segment = await get('segments', audience.segmentId); if (!segment || segment.isArchived || !segment.isEnabled) return []; }
    const byToken = new Map();
    for (const user of users) byToken.set(user.fcmToken, { token: user.fcmToken, userId: user._id.toString(), userName: user.name, rasi: user.rasi, platform: 'unknown', isEnabled: true });
    for (const device of devices) {
      const previous = byToken.get(device.token) || {};
      byToken.set(device.token, { ...previous, ...device, userId: previous.userId || device.userId, userName: previous.userName });
    }
    return [...byToken.values()].filter(device => {
      if (!device.token || !device.isEnabled || optedOut.has(device.deviceId)) return false;
      const userIds = audience.kind === 'segment' ? segment.userIds : audience.userIds;
      if (['selected', 'test', 'segment'].includes(audience.kind) && !userIds?.includes(device.userId)) return false;
      if (['android', 'ios'].includes(audience.kind) && device.platform !== audience.kind) return false;
      if (audience.kind === 'rasi' && canonicalRasi(device.rasi) !== canonicalRasi(audience.rasi)) return false;
      if (audience.kind === 'topic' && !device.topics?.includes(audience.topic)) return false;
      return true;
    });
  }
  async function dispatch(input) {
    const logs = await collection('logs'), attempts = await collection('attempts'), now = clock();
    const idempotencyKey = v.text(input.idempotencyKey, 200);
    const log = { definitionKey: input.definitionKey, ruleId: input.ruleId || null, campaignId: input.campaignId || null, idempotencyKey, source: input.source || 'manual', status: 'checking', createdAt: now, attempted: 0, accepted: 0, failed: 0, openCount: 0 };
    try { const result = await logs.insertOne(log); log._id = result.insertedId; }
    catch (error) { if (error.code === 11000) return publicRecord(await logs.findOne({ idempotencyKey })); throw error; }
    try {
      let controls = await allowed(input.definitionKey, input.ruleId, input.campaignId);
      if (!controls) { await logs.updateOne({ _id: log._id }, { $set: { status: 'skipped', reason: 'Disabled, paused, cancelled or unavailable configuration', finishedAt: clock() } }); return publicRecord(await logs.findOne({ _id: log._id })); }
      const { definition, rule } = controls;
      const templateId = input.templateId || rule?.templateId;
      const template = templateId ? await get('templates', templateId) : null;
      if (templateId && (!template || template.isArchived || !template.isEnabled)) throw new v.NotificationError(400, 'Template unavailable or disabled');
      const title = v.text(v.render(input.title || template?.title || definition.title, input.variables || {}), 200);
      const message = v.text(v.render(input.message || template?.message || definition.message, input.variables || {}), 1000);
      const imageUrl = v.image(input.imageUrl || definition.imageUrl);
      const target = v.audience(input.audience || rule?.audience || definition.audience);
      const destination = v.destination(input.destination || definition.destination, input.parameters || definition.parameters || {});
      const candidates = await recipients(target, definition.categoryKey);
      await logs.updateOne({ _id: log._id }, { $set: { title, message, categoryKey: definition.categoryKey, audience: target, destination: destination.destination, parameters: destination.parameters, scheduledAt: input.scheduledAt || null, eligible: candidates.length, status: 'sending' } });
      let accepted = 0, failed = 0, attempted = 0;
      for (let offset = 0; offset < candidates.length; offset += 500) {
        controls = await allowed(input.definitionKey, input.ruleId, input.campaignId);
        if (!controls) break;
        // Recheck recipient preferences immediately before each FCM batch.
        const currentEligible = new Set((await recipients(target, definition.categoryKey)).map(device => device.token));
        const batch = candidates.slice(offset, offset + 500).filter(device => currentEligible.has(device.token));
        if (!batch.length) continue;
        const sendable = [];
        for (const device of batch) {
          const attempt = { runId: log._id, tokenHash: v.digest(device.token), deviceId: device.deviceId || null, userId: device.userId || null, status: 'sending', createdAt: clock() };
          try { await attempts.insertOne(attempt); sendable.push(device); } catch (error) { if (error.code !== 11000) throw error; }
        }
        if (!sendable.length) continue;
        // Never retry an ambiguous request. FCM has no exactly-once transaction API.
        const origin = process.env.PUBLIC_API_URL || '';
        const fullImage = imageUrl.startsWith('/') ? (origin ? `${origin.replace(/\/$/, '')}${imageUrl}` : '') : imageUrl;
        if (imageUrl && !fullImage) throw new v.NotificationError(400, 'Configure a public HTTPS media URL for notification images');
        if (!await allowed(input.definitionKey, input.ruleId, input.campaignId)) {
          await attempts.updateMany({ runId: log._id, status: 'sending' }, { $set: { status: 'skipped' } }); break;
        }
        attempted += sendable.length;
        const branding = await (await dbProvider()).collection('AppContent').findOne({ key: 'notification_icon' });
        const notificationIcon = require('../utils/appBranding').notificationIcon(branding?.en || branding?.ta);
        const customIcon = require('../utils/appBranding').customIcon(branding?.en || branding?.ta);
        const configuredIcon = customIcon ? { ...customIcon, imageUrl: origin ? `${origin.replace(/\/$/, '')}${customIcon.imageUrl}` : customIcon.imageUrl } : null;
        await logs.updateOne({ _id: log._id }, { $set: { attempted } });
        const response = await require('../utils/brandedNotification').sendBrandedNotification(firebase(), sendable, {
          tokens: sendable.map(device => device.token), notification: { title, body: message, ...(fullImage ? { imageUrl: fullImage } : {}) },
          data: { title, body: message, notificationIcon, categoryKey: definition.categoryKey, definitionKey: definition.key, destination: destination.destination, parameters: JSON.stringify(destination.parameters), notificationId: log._id.toString(), click_action: 'FLUTTER_NOTIFICATION_CLICK' },
          android: { priority: 'high', notification: { icon: notificationIcon, channelId: 'valikati_high_importance_channel_v2', sound: 'default', ...(fullImage ? { imageUrl: fullImage } : {}) } },
          apns: { payload: { aps: { sound: 'default', ...(fullImage ? { mutableContent: true } : {}) } }, ...(fullImage ? { fcmOptions: { imageUrl: fullImage } } : {}) },
        }, configuredIcon);
        accepted += response.successCount; failed += response.failureCount;
        for (let index = 0; index < sendable.length; index++) {
          const result = response.responses[index], device = sendable[index];
          await attempts.updateOne({ runId: log._id, tokenHash: v.digest(device.token) }, { $set: { status: result.success ? 'accepted' : 'failed', errorCode: result.error?.code || null, finishedAt: clock() } });
          if (['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(result.error?.code)) {
            await (await collection('devices')).updateMany({ token: device.token }, { $set: { isEnabled: false } });
            await (await dbProvider()).collection('User').updateMany({ fcmToken: device.token }, { $set: { fcmToken: null } });
          }
        }
        await logs.updateOne({ _id: log._id }, { $set: { attempted, accepted, failed } });
      }
      const state = !await allowed(input.definitionKey, input.ruleId, input.campaignId) ? 'stopped' : attempted === 0 ? 'no_recipients' : failed === 0 ? 'accepted' : accepted ? 'partial' : 'failed';
      await logs.updateOne({ _id: log._id }, { $set: { status: state, attempted, accepted, failed, finishedAt: clock() } });
      if (accepted && !input.test) await (await dbProvider()).collection('Notification').insertOne({ title, message, target: target.kind === 'rasi' ? target.rasi : target.kind === 'all' ? 'all' : `campaign:${log._id}`, categoryKey: definition.categoryKey, definitionKey: definition.key, destination: destination.destination, parameters: destination.parameters, runId: log._id.toString(), recipientUserIds: candidates.map(device => device.userId).filter(Boolean), createdAt: now });
    } catch (error) {
      await logs.updateOne({ _id: log._id }, { $set: { status: 'unknown', error: 'Dispatch interrupted; inspect attempts before any manual retry', finishedAt: clock() } });
      // Only the sanitized code is retained. Provider errors can contain tokens.
      await attempts.updateMany({ runId: log._id, status: 'sending' }, { $set: { status: 'unknown', errorCode: error.code || 'dispatch_interrupted' } });
    }
    return publicRecord(await logs.findOne({ _id: log._id }));
  }
  async function event(trigger, eventId, values = {}, parameters = {}, audience) {
    const rules = await (await collection('rules')).find({ trigger, isArchived: { $ne: true } }).toArray();
    for (const rule of rules) {
      const result = await dispatch({ definitionKey: rule.definitionKey, ruleId: rule._id.toString(), idempotencyKey: `${rule._id}:${trigger}:${eventId}`, variables: values, parameters, audience, source: trigger });
      await (await collection('rules')).updateOne({ _id: rule._id }, { $set: { lastRun: clock(), lastStatus: result.status } });
    }
  }
  async function tick() {
    const now = clock();
    // Publication events for scheduled posters are derived from existing storage.
    // Windowing avoids replaying older posts when a rule is enabled later.
    const posterRules = await (await collection('rules')).find({ trigger: 'poster_published', isArchived: { $ne: true } }).toArray();
    if (posterRules.length) {
      const posts = await (await dbProvider()).collection('poster_posts').find({ isEnabled: true, status: { $in: ['published', 'scheduled'] }, publishedAt: { $gt: new Date(now.getTime() - 60000), $lte: now } }).toArray();
      for (const post of posts) await event('poster_published', post._id.toString(), { poster_caption: post.caption || 'புதிய பதிவு' }, { posterId: post._id.toString() });
    }
    // Crash-ambiguous sends are visible and are never automatically redispatched.
    await (await collection('logs')).updateMany({ status: { $in: ['checking', 'sending'] }, createdAt: { $lt: new Date(now.getTime() - 10 * 60000) } }, { $set: { status: 'unknown', error: 'Worker interrupted; automatic replay suppressed' } });
    await (await collection('campaigns')).updateMany({ status: 'sending', updatedAt: { $lt: new Date(now.getTime() - 10 * 60000) } }, { $set: { status: 'paused', isEnabled: false, lastStatus: 'unknown', nextRun: null, updatedAt: now } });
    for (const name of ['rules', 'campaigns']) {
      const records = await (await collection(name)).find({ nextRun: { $lte: now, $ne: null }, isArchived: { $ne: true }, ...(name === 'campaigns' ? { status: 'scheduled' } : { trigger: 'scheduled' }) }).limit(50).toArray();
      for (const row of records) {
        const due = row.nextRun;
        const next = row.schedule ? v.nextRun(row.schedule, now) : null;
        const claimed = await (await collection(name)).findOneAndUpdate({ _id: row._id, nextRun: due, ...(name === 'campaigns' ? { status: 'scheduled' } : {}) }, { $set: { nextRun: next, ...(name === 'campaigns' ? { status: 'sending' } : {}), updatedAt: now } }, { returnDocument: 'after' });
        if (!claimed) continue;
        // Expired executions never catch up after downtime or re-enabling.
        const fresh = now.getTime() - due.getTime() < 2 * 60000;
        const result = fresh ? await dispatch({ ...row, definitionKey: row.definitionKey, ruleId: name === 'rules' ? row._id.toString() : null, campaignId: name === 'campaigns' ? row._id.toString() : null, scheduledAt: due, idempotencyKey: `${name}:${row._id}:${due.toISOString()}`, source: 'scheduled' }) : { status: 'missed' };
        const current = await get(name, row._id.toString());
        await (await collection(name)).updateOne({ _id: row._id }, { $set: { lastRun: now, lastStatus: result.status, ...(name === 'campaigns' && current.status === 'sending' ? { status: next ? 'scheduled' : ['skipped', 'missed', 'no_recipients'].includes(result.status) ? 'paused' : result.status } : {}) } });
      }
    }
  }
  async function validate(resource, body) {
    if (['categories', 'definitions', 'rules', 'templates', 'segments'].includes(resource)) {
      if (body.isEnabled !== undefined && typeof body.isEnabled !== 'boolean') v.fail('Choose ON or OFF');
      const common = { name: v.text(body.name, 100), isEnabled: body.isEnabled !== false, description: v.text(body.description || '', 500, false), updatedAt: clock() };
      if (resource === 'categories') return { ...common, key: v.key(body.key) };
      if (resource === 'templates') return { ...common, title: v.validateTemplate(v.text(body.title, 200)), message: v.validateTemplate(v.text(body.message, 1000)) };
      if (resource === 'segments') return { ...common, userIds: v.audience({ kind: 'selected', userIds: body.userIds }).userIds };
      if (resource === 'definitions') {
        if (!await (await collection('categories')).findOne({ key: body.categoryKey, isArchived: { $ne: true } })) v.fail('Select an existing category');
        if (!v.triggers.includes(body.trigger)) v.fail('Unsupported trigger; backend event integrations must be registered in code');
        return { ...common, key: v.key(body.key), categoryKey: body.categoryKey, trigger: body.trigger, title: v.validateTemplate(v.text(body.title, 200)), message: v.validateTemplate(v.text(body.message, 1000)), imageUrl: v.image(body.imageUrl), ...v.destination(body.destination, body.parameters || {}), audience: v.audience(body.audience || { kind: 'all' }) };
      }
      if (resource === 'rules') {
        if (!v.triggers.includes(body.trigger) || body.trigger === 'manual') v.fail('Select a supported automation trigger');
        if (!await (await collection('definitions')).findOne({ key: body.definitionKey, isArchived: { $ne: true } })) v.fail('Select a notification definition');
        if (body.templateId && !await get('templates', body.templateId)) v.fail('Template not found');
        const schedule = body.trigger === 'scheduled' ? v.schedule(body.schedule, clock()) : null;
        return { ...common, definitionKey: body.definitionKey, trigger: body.trigger, templateId: body.templateId || null, audience: v.audience(body.audience || { kind: 'all' }), schedule, nextRun: schedule ? v.nextRun(schedule, clock()) : null };
      }
    }
    if (resource === 'campaigns') {
      if (body.isEnabled !== undefined && typeof body.isEnabled !== 'boolean') v.fail('Choose ON or OFF');
      if (!await (await collection('definitions')).findOne({ key: body.definitionKey, isArchived: { $ne: true } })) v.fail('Select a notification type');
      const schedule = body.status === 'scheduled' ? v.schedule(body.schedule, clock()) : null;
      if (!['draft', 'scheduled'].includes(body.status)) v.fail('Save as draft or schedule');
      return { definitionKey: body.definitionKey, title: v.text(body.title, 200), message: v.text(body.message, 1000), imageUrl: v.image(body.imageUrl), ...v.destination(body.destination, body.parameters || {}), audience: v.audience(body.audience), status: body.status, isEnabled: body.isEnabled !== false, schedule, nextRun: schedule ? v.nextRun(schedule, clock()) : null, updatedAt: clock() };
    }
    v.fail('Unknown notification resource');
  }
  async function list(resource, query = {}) {
    const filter = { isArchived: { $ne: true } };
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey);
    if (query.status) filter.status = String(query.status);
    if (query.enabled === 'true' || query.enabled === 'false') filter.isEnabled = query.enabled === 'true';
    if (query.ruleId) filter.ruleId = String(query.ruleId);
    if (query.q) { const escaped = String(query.q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = ['title', 'name', 'definitionKey'].map(field => ({ [field]: { $regex: escaped, $options: 'i' } })); }
    if (query.from || query.to) { filter.createdAt = {}; if (query.from) { const d = new Date(query.from); if (!Number.isFinite(d.getTime())) v.fail('Invalid date filter'); filter.createdAt.$gte = d; } if (query.to) { const d = new Date(query.to); if (!Number.isFinite(d.getTime())) v.fail('Invalid date filter'); filter.createdAt.$lte = d; } }
    const page = Math.max(1, Math.min(10000, Number(query.page) || 1)), limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const c = await collection(resource), total = await c.countDocuments(filter);
    return { items: (await c.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray()).map(publicRecord), total, page, totalPages: Math.ceil(total / limit) };
  }
  async function save(resource, body, id) {
    const previous = id ? await get(resource, id) : null;
    if (id && (!previous || previous.isArchived)) throw new v.NotificationError(404, 'Record not found');
    if (resource === 'campaigns' && previous && !['draft', 'scheduled', 'paused'].includes(previous.status)) v.fail('Only unsent campaigns can be edited');
    const data = await validate(resource, body);
    if (previous && ['definitions', 'categories'].includes(resource) && data.key !== previous.key) v.fail('Existing keys cannot be renamed');
    if (id) { await (await collection(resource)).updateOne({ _id: oid(id) }, { $set: data }); return publicRecord(await get(resource, id)); }
    const row = { ...data, createdAt: clock(), isArchived: false };
    if (resource === 'campaigns') row.requestId = v.text(body.requestId, 100);
    try { const result = await (await collection(resource)).insertOne(row); return publicRecord({ ...row, _id: result.insertedId }); }
    catch (error) { if (error.code === 11000 && resource === 'campaigns') return publicRecord(await (await collection(resource)).findOne({ requestId: row.requestId })); throw error; }
  }
  async function status(resource, id, body) {
    const row = await get(resource, id); if (!row) throw new v.NotificationError(404, 'Record not found');
    if (typeof body.isEnabled !== 'boolean') v.fail('Choose ON or OFF');
    const data = { isEnabled: body.isEnabled, updatedAt: clock() };
    if (resource === 'campaigns') {
      if (!['draft', 'scheduled', 'paused', 'sending'].includes(row.status)) v.fail('Completed or cancelled campaigns cannot resume');
      if (!body.isEnabled) data.status = 'paused';
      else { data.status = row.schedule ? 'scheduled' : 'draft'; data.nextRun = row.schedule ? v.nextRun(row.schedule, clock()) : null; if (row.schedule && !data.nextRun) v.fail('This one-time schedule has expired. Edit its date before resuming'); }
    }
    if (resource === 'rules' && row.schedule && body.isEnabled) data.nextRun = v.nextRun(row.schedule, clock());
    await (await collection(resource)).updateOne({ _id: oid(id) }, { $set: data });
    return publicRecord(await get(resource, id));
  }
  async function archive(resource, id) { await (await collection(resource)).updateOne({ _id: oid(id) }, { $set: { isEnabled: false, isArchived: true, ...(resource === 'campaigns' ? { status: 'cancelled', nextRun: null } : {}), updatedAt: clock() } }); return { archived: true }; }
  async function sendCampaign(id, test = false) {
    const row = await get('campaigns', id); if (!row || row.isArchived) throw new v.NotificationError(404, 'Campaign not found');
    if (test) {
      if (row.audience.kind !== 'test') v.fail('Choose up to five registered test recipients');
      return dispatch({ ...row, campaignId: null, test: true, idempotencyKey: `test:${row._id}`, source: 'test' });
    }
    const claimed = await (await collection('campaigns')).findOneAndUpdate({ _id: row._id, status: 'draft', isEnabled: true, isArchived: { $ne: true } }, { $set: { status: 'sending' } }, { returnDocument: 'after' });
    if (!claimed) return publicRecord(await (await collection('logs')).findOne({ idempotencyKey: `manual:${row._id}` })) || { status: 'not_active' };
    const result = await dispatch({ ...row, campaignId: id, idempotencyKey: `manual:${row._id}`, source: 'manual' });
    await (await collection('campaigns')).updateOne({ _id: row._id, status: 'sending' }, { $set: { status: result.status, lastRun: clock() } }); return result;
  }
  async function dashboard() {
    const c = name => collection(name);
    const settings = await (await c('settings')).findOne({ key: 'global' });
    const [categories, definitions, rules, templates, segments] = await Promise.all(['categories', 'definitions', 'rules', 'templates', 'segments'].map(name => list(name, { limit: 100 })));
    const counts = await (await c('logs')).aggregate([{ $group: { _id: null, sends: { $sum: { $cond: [{ $gt: ['$attempted', 0] }, 1, 0] } }, accepted: { $sum: '$accepted' }, failed: { $sum: '$failed' } } }]).toArray();
    const categoryCounts = await (await c('definitions')).aggregate([{ $match: { isArchived: { $ne: true } } }, { $group: { _id: '$categoryKey', active: { $sum: { $cond: ['$isEnabled', 1, 0] } }, inactive: { $sum: { $cond: ['$isEnabled', 0, 1] } } } }]).toArray();
    return { globalEnabled: settings?.isEnabled === true, categories: categories.items.map(cat => ({ ...cat, counts: categoryCounts.find(row => row._id === cat.key) || { active: 0, inactive: 0 } })), definitions: definitions.items, rules: rules.items, templates: templates.items, segments: segments.items, counts: { types: definitions.total, automations: await (await c('rules')).countDocuments({ isEnabled: true, isArchived: { $ne: true } }), sends: counts[0]?.sends || 0, accepted: counts[0]?.accepted || 0, failed: counts[0]?.failed || 0, devices: (await recipients({ kind: 'all' }, '__count__')).length }, destinations: v.destinations, triggers: v.triggers, variables: v.variables, recent: await list('logs', { limit: 5 }), scheduled: await list('campaigns', { status: 'scheduled', limit: 5 }) };
  }
  async function deviceRegister(body) {
    const deviceId = v.text(body.deviceId, 100), secret = v.text(body.secret, 128), token = v.text(body.token, 4096);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(deviceId) || secret.length < 32 || !['android', 'ios'].includes(body.platform) || typeof body.isEnabled !== 'boolean') v.fail('Invalid device registration');
    const c = await collection('devices'), existing = await c.findOne({ deviceId });
    const secretHash = v.digest(secret);
    if (existing && existing.secretHash !== secretHash) throw new v.NotificationError(401, 'Invalid device credential');
    const duplicate = await c.findOne({ token, deviceId: { $ne: deviceId } });
    if (duplicate) throw new v.NotificationError(409, 'Token already belongs to a registered installation');
    await c.updateOne({ deviceId }, { $set: { secretHash, token, platform: body.platform, isEnabled: body.isEnabled, customNotificationIcons: body.customNotificationIcons === true && body.platform === 'android', topics: Array.isArray(body.topics) ? body.topics.filter(topic => /^[a-zA-Z0-9_-]{1,80}$/.test(topic)).slice(0, 20) : [], updatedAt: clock() }, $setOnInsert: { deviceId, createdAt: clock() } }, { upsert: true });
    return { registered: true };
  }
  async function verifyDevice(deviceId, secret) {
    if (!deviceId || !secret) throw new v.NotificationError(401, 'Device credential required');
    const device = await (await collection('devices')).findOne({ deviceId });
    if (!device || device.secretHash !== v.digest(secret)) throw new v.NotificationError(401, 'Invalid device credential');
    return device;
  }
  async function preferences(device, body) {
    if (body) {
      const c = await collection('categories');
      for (const [categoryKey, isEnabled] of Object.entries(body.categories || {})) {
        if (typeof isEnabled !== 'boolean' || !await c.findOne({ key: categoryKey, isArchived: { $ne: true } })) v.fail('Invalid notification preference');
        await (await collection('preferences')).updateOne({ deviceId: device.deviceId, categoryKey }, { $set: { isEnabled, updatedAt: clock() }, $setOnInsert: { deviceId: device.deviceId, categoryKey } }, { upsert: true });
      }
    }
    const [categories, prefs] = await Promise.all([(await collection('categories')).find({ isArchived: { $ne: true } }).toArray(), (await collection('preferences')).find({ deviceId: device.deviceId }).toArray()]);
    return { categories: categories.map(row => ({ key: row.key, name: row.name, description: row.description, available: row.isEnabled, isEnabled: prefs.find(p => p.categoryKey === row.key)?.isEnabled !== false })) };
  }
  async function opened(device, runId) {
    const result = await (await collection('attempts')).updateOne({ runId: oid(runId), tokenHash: v.digest(device.token), status: 'accepted', openedAt: { $exists: false } }, { $set: { openedAt: clock() } });
    if (result.modifiedCount) await (await collection('logs')).updateOne({ _id: oid(runId) }, { $inc: { openCount: 1 } });
    return { recorded: !!result.modifiedCount };
  }
  async function attemptSummary(runId) {
    const rows = await (await collection('attempts')).find({ runId: oid(runId) }, { projection: { tokenHash: 0, deviceId: 0, userId: 0 } }).sort({ createdAt: -1 }).limit(500).toArray();
    return rows.map(publicRecord);
  }
  async function liveEvent(name, data) {
    if (data.action === 'delete' || data.bulk) return;
    const id = data.id || data._id?.toString();
    if (!id) return;
    if (name === 'panchangam_updated') await event('panchangam_updated', `${id}:${v.digest(JSON.stringify(data))}`, { date: String(data.date || '') }, { date: String(data.date || '').slice(0, 10) });
    if (name === 'festivals_updated') await event('festival_updated', `${id}:${v.digest(JSON.stringify(data))}`, { festival_name: data.name || 'Festival' }, {});
    if (name === 'poster_posts_updated' && /^[a-f\d]{24}$/i.test(id)) {
      const post = await (await dbProvider()).collection('poster_posts').findOne({ _id: oid(id), isEnabled: true, status: { $in: ['published', 'scheduled'] }, publishedAt: { $lte: clock(), $ne: null } });
      if (post && clock().getTime() - post.publishedAt.getTime() < 60000) await event('poster_published', id, { poster_caption: post.caption || 'புதிய பதிவு' }, { posterId: id });
    }
  }
  return { dispatch, event, tick, liveEvent, dashboard, list, save, status, archive, sendCampaign, allowed, recipients, deviceRegister, verifyDevice, preferences, opened, get, collection, publicRecord, dbProvider, async global(isEnabled) { if (typeof isEnabled !== 'boolean') v.fail('Choose ON or OFF'); await (await collection('settings')).updateOne({ key: 'global' }, { $set: { isEnabled, updatedAt: clock() } }); return { isEnabled }; } };
}
let singleton;
const notificationService = () => singleton ||= createNotificationService();
module.exports = { createNotificationService, notificationService };
