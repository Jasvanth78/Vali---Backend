const { MongoClient, ObjectId } = require('mongodb');

const DEFAULT_CATEGORIES = [
  ['morning', 'காலை வணக்கம்', 'Good morning'],
  ['evening', 'மாலை வணக்கம்', 'Good evening'],
  ['night', 'இரவு வணக்கம்', 'Good night'],
  ['devotional', 'ஆன்மீக வாழ்த்துக்கள்', 'Devotional'],
  ['quotes', 'தினசரி பொன்மொழிகள்', 'Daily quotes'],
  ['festival', 'திருவிழா வாழ்த்துக்கள்', 'Festival greetings'],
  ['tamil-greetings', 'தமிழ் வாழ்த்து படங்கள்', 'Tamil greetings'],
];
class PosterError extends Error { constructor(status, message) { super(message); this.status = status; } }
const objectId = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new PosterError(400, 'Invalid ID');
  return new ObjectId(value);
};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const visibility = now => ({ isEnabled: true, status: { $in: ['published', 'scheduled'] }, publishedAt: { $lte: now, $ne: null } });
const effectiveStatus = (post, now) => post.status === 'scheduled' && post.publishedAt <= now ? 'published' : post.status;
let clientPromise;
async function getPosterDb() {
  if (!clientPromise) {
    const client = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
    clientPromise = client.connect().then(() => client.db()).catch(error => { clientPromise = null; throw error; });
  }
  return clientPromise;
}

// The optional prefix is used only by isolated integration tests.
function createPosterService(dbProvider = getPosterDb, prefix = 'poster_', clock = () => new Date()) {
  let schemaPromise;
  const db = async () => { const value = await dbProvider(); return { posts: value.collection(`${prefix}posts`), categories: value.collection(`${prefix}categories`), likes: value.collection(`${prefix}likes`), bookmarks: value.collection(`${prefix}bookmarks`) }; };
  async function ensureSchema() {
    if (!schemaPromise) schemaPromise = (async () => {
      const c = await db();
      await c.categories.createIndex({ slug: 1 }, { unique: true });
      await c.posts.createIndex({ status: 1, isEnabled: 1, publishedAt: -1, _id: -1 });
      await c.posts.createIndex({ categoryId: 1, publishedAt: -1 });
      for (const collection of [c.likes, c.bookmarks]) {
        await collection.createIndex({ postId: 1, actorId: 1 }, { unique: true });
        await collection.createIndex({ actorId: 1, createdAt: -1 });
      }
      for (const [order, [slug, nameTa, nameEn]] of DEFAULT_CATEGORIES.entries()) {
        await c.categories.updateOne({ slug }, { $setOnInsert: { slug, nameTa, nameEn, order, createdAt: clock() } }, { upsert: true });
      }
      return true;
    })().catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
  }
  function categoryDto(category) { return { id: category._id.toString(), slug: category.slug, nameTa: category.nameTa, nameEn: category.nameEn }; }
  async function categories() { const c = await db(); return (await c.categories.find().sort({ order: 1, _id: 1 }).toArray()).map(categoryDto); }
  async function createCategory(input) {
    const { slug, nameTa, nameEn } = input;
    if (typeof slug !== 'string' || !/^[a-z][a-z0-9-]{1,49}$/.test(slug) || typeof nameTa !== 'string' || !nameTa.trim() || typeof nameEn !== 'string' || !nameEn.trim() || nameTa.length > 100 || nameEn.length > 100) throw new PosterError(400, 'Provide a unique category slug and Tamil/English names');
    const c = await db();
    const record = { slug, nameTa: nameTa.trim(), nameEn: nameEn.trim(), order: await c.categories.countDocuments(), createdAt: clock() };
    try { record._id = (await c.categories.insertOne(record)).insertedId; }
    catch (error) { if (error.code === 11000) throw new PosterError(409, 'Category slug already exists'); throw error; }
    return categoryDto(record);
  }
  async function decorate(records, actorId) {
    if (!records.length) return [];
    const c = await db(), ids = records.map(p => p._id);
    const [counts, liked, saved, cats] = await Promise.all([
      c.likes.aggregate([{ $match: { postId: { $in: ids } } }, { $group: { _id: '$postId', count: { $sum: 1 } } }]).toArray(),
      actorId ? c.likes.find({ postId: { $in: ids }, actorId }).toArray() : [],
      actorId ? c.bookmarks.find({ postId: { $in: ids }, actorId }).toArray() : [],
      c.categories.find({ _id: { $in: records.map(p => p.categoryId) } }).toArray(),
    ]);
    const countMap = new Map(counts.map(c => [c._id.toString(), c.count])), likedSet = new Set(liked.map(l => l.postId.toString())), savedSet = new Set(saved.map(b => b.postId.toString())), catMap = new Map(cats.map(cat => [cat._id.toString(), categoryDto(cat)]));
    return records.map(p => ({ id: p._id.toString(), imageUrl: p.imageUrl, caption: p.caption || '', categoryId: p.categoryId.toString(), category: catMap.get(p.categoryId.toString()) || null, status: p.status, effectiveStatus: effectiveStatus(p, clock()), isEnabled: p.isEnabled, publishedAt: p.publishedAt, createdAt: p.createdAt, updatedAt: p.updatedAt, likeCount: countMap.get(p._id.toString()) || 0, liked: likedSet.has(p._id.toString()), bookmarked: savedSet.has(p._id.toString()) }));
  }
  async function list(query = {}, actorId) {
    const limit = Number(query.limit || 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new PosterError(400, 'Limit must be 1–50');
    const c = await db(), filters = [visibility(clock())];
    if (query.category) {
      if (typeof query.category !== 'string' || !/^[a-z][a-z0-9-]{1,49}$/.test(query.category)) throw new PosterError(400, 'Invalid category');
      const category = await c.categories.findOne({ slug: query.category });
      if (!category) return { items: [], nextCursor: null };
      filters.push({ categoryId: category._id });
    }
    if (query.q) {
      if (typeof query.q !== 'string' || query.q.length > 100) throw new PosterError(400, 'Search is too long');
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      const matchingCategories = await c.categories.find({ $or: [{ nameTa: pattern }, { nameEn: pattern }] }, { projection: { _id: 1 } }).toArray();
      filters.push({ $or: [{ caption: pattern }, { categoryId: { $in: matchingCategories.map(category => category._id) } }] });
    }
    if (query.bookmarked === 'true') {
      if (!actorId) throw new PosterError(401, 'A poster session is required');
      filters.push({ _id: { $in: (await c.bookmarks.find({ actorId }, { projection: { postId: 1 } }).toArray()).map(b => b.postId) } });
    }
    if (query.cursor) {
      let cursor;
      try { if (typeof query.cursor !== 'string' || query.cursor.length > 250) throw Error(); cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()); }
      catch (_) { throw new PosterError(400, 'Invalid cursor'); }
      const id = objectId(cursor.id), date = new Date(cursor.date);
      if (!Number.isFinite(date.getTime())) throw new PosterError(400, 'Invalid cursor date');
      filters.push({ $or: [{ publishedAt: { $lt: date } }, { publishedAt: date, _id: { $lt: id } }] });
    }
    const records = await c.posts.find({ $and: filters }).sort({ publishedAt: -1, _id: -1 }).limit(limit + 1).toArray();
    const hasMore = records.length > limit, page = records.slice(0, limit), last = page.at(-1);
    return { items: await decorate(page, actorId), nextCursor: hasMore ? Buffer.from(JSON.stringify({ date: last.publishedAt.toISOString(), id: last._id.toString() })).toString('base64url') : null };
  }
  async function get(id, actorId, admin = false) {
    const c = await db();
    const record = await c.posts.findOne({ _id: objectId(id), ...(admin ? {} : visibility(clock())) });
    if (!record) throw new PosterError(404, 'Poster not found');
    return (await decorate([record], actorId))[0];
  }
  async function adminList(query) {
    const page = Number(query.page || 1), limit = 30;
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new PosterError(400, 'Invalid page');
    const filter = {};
    if (query.status && query.status !== 'all') {
      if (!['draft', 'published', 'scheduled'].includes(query.status)) throw new PosterError(400, 'Invalid status');
      if (query.status === 'published') filter.$or = [{ status: 'published' }, { status: 'scheduled', publishedAt: { $lte: clock() } }];
      else if (query.status === 'scheduled') Object.assign(filter, { status: 'scheduled', publishedAt: { $gt: clock() } });
      else filter.status = 'draft';
    }
    const c = await db();
    const [records, total] = await Promise.all([c.posts.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(), c.posts.countDocuments(filter)]);
    return { items: await decorate(records), page, total, totalPages: Math.ceil(total / limit) };
  }
  async function validate(input, previous) {
    const values = { ...previous, ...input };
    if (typeof values.imageUrl !== 'string' || values.imageUrl.length > 15000000) throw new PosterError(400, 'A poster image is required');
    const url = values.imageUrl.trim();
    if (!/^(https?:\/\/|\/uploads\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(url) || /\.svg(?:$|\?)/i.test(url)) throw new PosterError(400, 'Use a JPG, PNG, WEBP or GIF image URL/upload');
    if (values.caption != null && (typeof values.caption !== 'string' || values.caption.length > 500)) throw new PosterError(400, 'Caption must be at most 500 characters');
    if (!['draft', 'published', 'scheduled'].includes(values.status || 'draft')) throw new PosterError(400, 'Invalid publication status');
    if (values.isEnabled != null && typeof values.isEnabled !== 'boolean') throw new PosterError(400, 'Enabled must be true or false');
    const categoryId = objectId(values.categoryId?.toString()), c = await db();
    if (!await c.categories.findOne({ _id: categoryId })) throw new PosterError(400, 'Choose an existing poster category');
    let status = values.status || 'draft';
    if (status === 'scheduled' && previous?.status === 'scheduled' && previous.publishedAt <= clock() && input.publishedAt == null) status = 'published';
    let publishedAt = null;
    if (status === 'published') publishedAt = previous?.publishedAt && (previous.status === 'published' || previous.status === 'scheduled' && previous.publishedAt <= clock()) ? previous.publishedAt : clock();
    if (status === 'scheduled') {
      publishedAt = new Date(values.publishedAt);
      if (!values.publishedAt || !Number.isFinite(publishedAt.getTime()) || publishedAt <= clock()) throw new PosterError(400, 'Choose a future publication date');
    }
    return { imageUrl: url, caption: values.caption?.trim() || null, categoryId, status, isEnabled: values.isEnabled ?? true, publishedAt, updatedAt: clock() };
  }
  async function create(input) {
    const c = await db(), record = { ...await validate(input), createdAt: clock() };
    const result = await c.posts.insertOne(record);
    return get(result.insertedId.toString(), null, true);
  }
  async function update(id, input) {
    const c = await db(), _id = objectId(id), previous = await c.posts.findOne({ _id });
    if (!previous) throw new PosterError(404, 'Poster not found');
    const values = await validate(input, previous);
    await c.posts.updateOne({ _id }, { $set: values });
    return get(id, null, true);
  }
  async function remove(id) {
    const c = await db(), _id = objectId(id);
    if (!(await c.posts.deleteOne({ _id })).deletedCount) throw new PosterError(404, 'Poster not found');
    await Promise.all([c.likes.deleteMany({ postId: _id }), c.bookmarks.deleteMany({ postId: _id })]);
    return { success: true };
  }
  async function interact(id, actorId, type, selected) {
    if (!actorId) throw new PosterError(401, 'A poster session is required');
    if (typeof selected !== 'boolean') throw new PosterError(400, 'Specify true or false');
    await get(id, actorId);
    const c = await db(), collection = type === 'like' ? c.likes : c.bookmarks, postId = objectId(id);
    if (selected) {
      try { await collection.updateOne({ postId, actorId }, { $setOnInsert: { postId, actorId, createdAt: clock() } }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
    } else await collection.deleteOne({ postId, actorId });
    return get(id, actorId);
  }
  async function mergeInteractions(from, to) {
    if (!from?.startsWith('device:') || !to?.startsWith('google:')) return;
    const c = await db();
    for (const collection of [c.likes, c.bookmarks]) {
      for (const record of await collection.find({ actorId: from }).toArray()) {
        try { await collection.updateOne({ postId: record.postId, actorId: to }, { $setOnInsert: { postId: record.postId, actorId: to, createdAt: record.createdAt } }, { upsert: true }); }
        catch (error) { if (error.code !== 11000) throw error; }
        await collection.deleteOne({ _id: record._id, actorId: from });
      }
    }
  }
  return { ensureSchema, categories, createCategory, list, get, adminList, create, update, remove, interact, mergeInteractions };
}
module.exports = { createPosterService, getPosterDb, DEFAULT_CATEGORIES, PosterError, visibility };
