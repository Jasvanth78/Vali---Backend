function validateHomeContent(key, value) {
  if (key === 'home_weather_location') {
    const data = JSON.parse(value);
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number' || typeof data.label !== 'string' || !data.label.trim()) throw new Error('Enter a city name and numeric coordinates.');
    require('./weather').coordinates(data.latitude, data.longitude);
  }
  if (key === 'home_layout') {
    const data = JSON.parse(value);
    const names = ['hero', 'clock', 'services', 'holidays', 'proverb', 'articles'];
    if (!Array.isArray(data.sections) || data.sections.length !== names.length) throw new Error('Home layout must contain all six sections.');
    const seen = new Set();
    for (const section of data.sections) {
      if (!names.includes(section.key) || seen.has(section.key) || typeof section.enabled !== 'boolean') throw new Error('Invalid or duplicate home section.');
      seen.add(section.key);
    }
  }
}
module.exports = { validateHomeContent };
