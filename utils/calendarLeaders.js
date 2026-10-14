function validateCalendarLeaders(raw) {
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('Leaders must be a list of up to 100 cards.');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('Leader cards need unique IDs.');
    ids.add(row.id);
    for (const field of ['nameTa', 'nameEn', 'imageUrl', 'date']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error(`Leader ${field} is required.`);
    }
    for (const field of ['captionTa', 'captionEn', 'sourceUrl']) {
      if (typeof row[field] !== 'string') throw new Error(`Leader ${field} must be text.`);
    }
    const date = new Date(`${row.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) throw new Error('Enter a valid leader date.');
    if (!/^(https?:\/\/|\/uploads\/|assets\/images\/)/i.test(row.imageUrl)) throw new Error('Upload an image or enter an HTTP image URL.');
    if (row.sourceUrl && !/^https?:\/\/\S+$/i.test(row.sourceUrl)) throw new Error('Source link must be an HTTP URL.');
    if (typeof row.enabled !== 'boolean' || typeof row.remembrance !== 'boolean') throw new Error('Leader visibility and date type are required.');
  }
  return rows;
}
module.exports = { validateCalendarLeaders };
