const test = require('node:test');
const assert = require('node:assert/strict');
const { validateHeroSlider } = require('../utils/heroSlider');
const slide = { id: 'one', imageUrl: 'https://example.com/image.jpg', titleTa: 'ராசி பலன்', descriptionTa: 'இன்றைய பலன்', buttonTextTa: 'பார்க்க', destination: 'screen:daily_palan', enabled: true };
const raw = (slides = [slide], autoplaySeconds = 5) => JSON.stringify({ autoplaySeconds, slides });
test('accepts unlimited ordered slides, disabled entries and empty publication', () => {
  const slides = Array.from({ length: 200 }, (_, i) => ({ ...slide, id: `${i}`, enabled: i % 2 === 0 }));
  assert.deepEqual(validateHeroSlider(raw(slides)).slides, slides);
  assert.equal(validateHeroSlider(raw([])).slides.length, 0);
});
test('accepts supported internal and external destinations', () => {
  for (const destination of ['screen:panchangam', 'article:0123456789abcdef01234567', 'rasi:Mesham', 'https://example.com', 'valikati://screen/daily_palan']) {
    assert.doesNotThrow(() => validateHeroSlider(raw([{ ...slide, destination }])));
  }
});
test('rejects invalid duration, duplicate IDs, malformed data and unsafe links', () => {
  for (const seconds of [0, 1, 121, 2.5, '5']) assert.throws(() => validateHeroSlider(raw([slide], seconds)));
  assert.throws(() => validateHeroSlider(raw([slide, slide])));
  assert.throws(() => validateHeroSlider('{'));
  for (const destination of ['javascript:alert(1)', 'file:///private', 'article:unknown', '']) assert.throws(() => validateHeroSlider(raw([{ ...slide, destination }])));
  assert.throws(() => validateHeroSlider(raw([{ ...slide, titleTa: '' }])));
});
