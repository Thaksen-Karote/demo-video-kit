// Fast checks for the pure helpers (no browser, no network). Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { srtTime, splitCue, wrap, outputName, noOverlap } = require('../lib/render');
const { splitSentences, escapeXml } = require('../lib/audio');

test('srtTime formats hours, minutes, seconds and milliseconds', () => {
  assert.strictEqual(srtTime(0), '00:00:00,000');
  assert.strictEqual(srtTime(3723.456), '01:02:03,456');
});

test('splitCue keeps a short cue and splits a long one in time order', () => {
  assert.deepStrictEqual(splitCue('Short.', 1, 2), [['Short.', 1, 2]]);
  const long = 'word '.repeat(40).trim();
  const parts = splitCue(long, 0, 10);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(([t]) => t.length <= 84));
  assert.strictEqual(parts[0][1], 0);
  assert.ok(Math.abs(parts.at(-1)[2] - 10) < 1e-9);
});

test('wrap breaks lines at the width', () => {
  assert.ok(wrap('a '.repeat(60)).split('\n').every((l) => l.length <= 56));
});

test('splitSentences and escapeXml', () => {
  assert.deepStrictEqual(splitSentences('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
  assert.strictEqual(escapeXml('A & B <c>'), 'A &amp; B &lt;c&gt;');
});

test('the video is named after its folder', () => {
  assert.strictEqual(outputName('demos/signup'), 'signup.mp4');
});

test('noOverlap ends each subtitle before the next starts', () => {
  const cues = noOverlap([{ start: 0.1, end: 2.665 }, { start: 2.615, end: 4.72 }, { start: 5, end: 6 }]);
  assert.strictEqual(cues[0].end, 2.605);
  assert.strictEqual(cues[1].end, 4.72);
});
