// demo.yaml reading and checking (no browser, no network). Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDemoYaml, narrationFromYaml } = require('../lib/demo-yaml');

function demo(yaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvk-'));
  fs.writeFileSync(path.join(dir, 'demo.yaml'), yaml);
  return dir;
}
const fails = (yaml, pattern) => assert.throws(() => loadDemoYaml(demo(yaml)), pattern);

test('reads steps, actions and options', () => {
  const d = loadDemoYaml(demo(`
url: https://example.com/
steps:
  - say: First.
    do:
      - click: Start
        within: Stopwatch
        highlight: true
      - type: { Email: someone@example.com }
  - scene: Two
    say: Second.
`));
  assert.strictEqual(d.url, 'https://example.com/');
  assert.strictEqual(d.steps.length, 2);
  assert.deepStrictEqual(d.steps[0].actions[0], { within: 'Stopwatch', highlight: true, type: 'click', value: 'Start', where: 'demo.yaml step 1, action 1' });
  assert.strictEqual(d.steps[0].actions[1].type, 'type');
  assert.deepStrictEqual(d.steps[0].actions[1].value, { Email: 'someone@example.com' });
  assert.strictEqual(d.steps[1].id, 'step-2');
  assert.strictEqual(d.steps[1].scene, 'Two');
});

test('the narration comes from the say lines', () => {
  const n = narrationFromYaml(demo('voice: en-US-AriaNeural\nsteps:\n  - say: Hello there.\n'));
  assert.strictEqual(n.voice, 'en-US-AriaNeural');
  assert.deepStrictEqual(n.segments, [{ id: 'step-1', scene: 'Step 1', text: 'Hello there.' }]);
});

test('$NAME reads the environment only when running, and names a missing variable', () => {
  const dir = demo('steps:\n  - say: Sign in.\n    do:\n      - type: { Password: $DVK_TEST_SECRET }\n');
  assert.strictEqual(loadDemoYaml(dir).steps[0].actions[0].value.Password, '$DVK_TEST_SECRET');
  assert.throws(() => loadDemoYaml(dir, { env: true }), /set the environment variable DVK_TEST_SECRET/);
  process.env.DVK_TEST_SECRET = 'hunter2';
  assert.strictEqual(loadDemoYaml(dir, { env: true }).steps[0].actions[0].value.Password, 'hunter2');
  delete process.env.DVK_TEST_SECRET;
});

test('clear errors for common mistakes', () => {
  fails('url: x\n', /needs a "steps:" list/);
  fails('steps:\n  - do:\n      - click: A\n', /step 1: every step needs "say:"/);
  fails('steps:\n  - say: Hi.\n    do:\n      - tap: A\n', /no action; use one of/);
  fails('steps:\n  - say: Hi.\n    do:\n      - click: A\n        point: B\n', /only one action per item/);
  fails('steps:\n  - say: Hi.\n    do:\n      - click: A\n        colour: red\n', /unknown option "colour"/);
  fails('steps:\n  - say: Hi.\n    do:\n      - type: hello\n', /type needs a map/);
  fails('steps:\n  - say: Hi.\n    do: click\n', /"do:" must be a list/);
  fails('steps:\n  - say: [unclosed\n', /not valid YAML/);
});
