const test = require('node:test');
const assert = require('assert');
const { normalizeRate } = require('../lib/audio');

test('a speaking speed can be written in the ways people write it', () => {
  assert.strictEqual(normalizeRate('+10%'), '+10%');
  assert.strictEqual(normalizeRate('-4%'), '-4%');
  assert.strictEqual(normalizeRate('10%'), '+10%');
  assert.strictEqual(normalizeRate('10'), '+10%');
  assert.strictEqual(normalizeRate(10), '+10%');
  assert.strictEqual(normalizeRate(' -5 '), '-5%');
  assert.throws(() => normalizeRate('fast'), /not a speed/);
  assert.throws(() => normalizeRate('1.5x'), /not a speed/);
});
