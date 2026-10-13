const registry = require('../config/adRegistry.json');
const { PrismaClient } = require('@prisma/client');
const unitPattern = /^ca-app-pub-\d{16}\/\d{10}$/;
class AdError extends Error { constructor(status, message) { super(message); this.status = status; } }
const validId = id => { if (!/^[a-f\d]{24}$/i.test(id || '')) throw new AdError(400, 'Invalid placement ID'); return id; };
function validatePlacement(body) {
  const page = registry.pages.find(p => p.key === body.pageKey);
  const slot = page?.slots.find(s => s.key === body.placementKey);
  if (!slot || !slot.formats.includes(body.adFormat)) throw new AdError(400, 'Unsupported page, placement, or ad format');
  const data = { pageKey: page.key, placementKey: slot.key, adFormat: body.adFormat };
  for (const field of ['androidAdUnitId', 'iosAdUnitId']) {
    if (typeof body[field] !== 'string') throw new AdError(400, `${field} must be a string`);
    data[field] = body[field].trim();
    if (data[field] && !unitPattern.test(data[field])) throw new AdError(400, 'Use an Ad Unit ID (ca-app-pub-16digits/10digits), not an App ID');
  }
  if (typeof body.isEnabled !== 'boolean') throw new AdError(400, 'Enabled must be ON or OFF');
  if (body.isEnabled && !data.androidAdUnitId && !data.iosAdUnitId) throw new AdError(400, 'Configure at least one platform before enabling');
  data.isEnabled = body.isEnabled;
  for (const [field, min, max, fallback] of [['sortOrder', 0, 1000, 0], ['frequencyCap', 60, 86400, 120]]) {
    const value = body[field] ?? fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw new AdError(400, `${field} must be ${min}–${max}${field === 'frequencyCap' ? ' seconds' : ''}`);
    data[field] = value;
  }
  return data;
}
function createAdService(prisma = new PrismaClient()) {
  async function settings() {
    const result = await prisma.adSettings.findUnique({ where: { key: 'global' } });
    if (!result) throw new AdError(503, 'Run the ad configuration migration first');
    return result;
  }
  async function list(publicOnly = false) {
    const state = await settings();
    const pages = Object.fromEntries(registry.pages.map(p => [p.key, state.pages[p.key] === true]));
    const placements = await prisma.adPlacement.findMany({ orderBy: [{ sortOrder: 'asc' }, { pageKey: 'asc' }, { placementKey: 'asc' }] });
    const supported = placements.filter(p => registry.pages.some(page => page.key === p.pageKey && page.slots.some(slot => slot.key === p.placementKey && slot.formats.includes(p.adFormat))));
    return { schemaVersion: registry.version, globalEnabled: state.globalEnabled, pages,
      placements: publicOnly ? supported.filter(p => state.globalEnabled && pages[p.pageKey] && p.isEnabled) : supported,
      ...(!publicOnly ? { registry } : {}) };
  }
  return {
    list,
    create: body => prisma.adPlacement.create({ data: validatePlacement(body) }),
    update: (id, body) => prisma.adPlacement.update({ where: { id: validId(id) }, data: validatePlacement(body) }),
    remove: id => prisma.adPlacement.delete({ where: { id: validId(id) } }),
    status: async (id, isEnabled) => {
      if (typeof isEnabled !== 'boolean') throw new AdError(400, 'Enabled must be ON or OFF');
      const row = await prisma.adPlacement.findUnique({ where: { id: validId(id) } });
      if (!row) throw new AdError(404, 'Placement not found');
      validatePlacement({ ...row, isEnabled });
      return prisma.adPlacement.update({ where: { id }, data: { isEnabled } });
    },
    saveSettings: async body => {
      if (typeof body.globalEnabled !== 'boolean' || !body.pages || typeof body.pages !== 'object' || Array.isArray(body.pages)) throw new AdError(400, 'Global and page toggles are required');
      if (Object.keys(body.pages).some(key => !registry.pages.some(p => p.key === key))) throw new AdError(400, 'Unsupported page');
      const pages = {};
      for (const page of registry.pages) {
        if (typeof body.pages[page.key] !== 'boolean') throw new AdError(400, `Set a toggle for ${page.label}`);
        pages[page.key] = body.pages[page.key];
      }
      return prisma.adSettings.update({ where: { key: 'global' }, data: { globalEnabled: body.globalEnabled, pages } });
    },
  };
}
module.exports = { createAdService, validatePlacement, registry, AdError };
