// Stored in the existing AppContent collection; no second database or migration.
const HERO_SLIDER_KEY = 'home_hero_slider';
function validateHeroSlider(raw) {
  const config = JSON.parse(raw);
  if (!Number.isInteger(config.autoplaySeconds) || config.autoplaySeconds < 2 || config.autoplaySeconds > 120 || !Array.isArray(config.slides)) throw new Error('Autoplay must be 2–120 seconds and slides must be an array.');
  const ids = new Set();
  for (const slide of config.slides) {
    if (typeof slide.id !== 'string' || !slide.id || ids.has(slide.id)) throw new Error('Slides need unique IDs.');
    ids.add(slide.id);
    for (const field of ['imageUrl', 'titleTa', 'descriptionTa', 'buttonTextTa', 'destination']) {
      if (typeof slide[field] !== 'string' || !slide[field].trim()) throw new Error(`Slide ${field} is required.`);
    }
    if (!/^(https?:\/\/|\/uploads\/|data:image\/)/i.test(slide.imageUrl)) throw new Error('Use an uploaded image or an HTTP image URL.');
    if (!/^(screen:[a-z_]+|article:[a-f\d]{24}|rasi:[a-z]+|https?:\/\/\S+|valikati:\/\/\S+)$/i.test(slide.destination)) throw new Error('Unsupported banner destination.');
    if (typeof slide.enabled !== 'boolean') throw new Error('Slide enabled must be a boolean.');
  }
  return config;
}
module.exports = { HERO_SLIDER_KEY, validateHeroSlider };
