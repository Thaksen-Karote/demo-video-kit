/**
 * End-to-end check of record-steps (needs Chrome or Edge; no internet for the recording itself).
 * A script plays the person: it uses the test shop like a user would, presses the control bar,
 * and then the demo.yaml that was written must play back through the normal player.
 *
 *   node test/record-steps.e2e.js [out-dir]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { recordSteps } = require('../lib/recorder');
const { loadDemoYaml } = require('../lib/demo-yaml');

const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'dvk-rec-')));
const url = pathToFileURL(path.join(__dirname, 'fixtures', 'form.html')).toString();
const bar = (page, cmd) => page.locator(`#__dvk_bar button[data-cmd="${cmd}"]`).click();

(async () => {
  fs.rmSync(path.join(out, 'demo.yaml'), { force: true });
  await recordSteps(out, {
    url, headless: true, log: () => {},
    async drive(page) {
      const pause = (ms) => page.waitForTimeout(ms);
      await page.locator('#__dvk_bar').waitFor();
      // Looking around while paused must not be recorded.
      await bar(page, 'toggle');
      await page.getByRole('button', { name: 'Add' }).first().click();
      await bar(page, 'toggle');

      await page.locator('#email').click();
      await page.keyboard.type('tester@example.com');
      await page.locator('#password').click();
      await page.keyboard.type('s3cret$pass');
      await page.locator('#remember').click();
      await page.locator('#country').selectOption({ label: 'Japan' });
      await page.getByRole('button', { name: 'Sign in' }).click();
      await pause(300);
      await bar(page, 'step');

      await page.getByPlaceholder('Search products').click();
      await page.keyboard.type('Cement');
      await page.keyboard.press('Enter');
      await page.locator('section').nth(2).getByRole('button', { name: 'Add' }).click(); // the Wishlist one
      await pause(300);
      await bar(page, 'step');

      await page.getByRole('link', { name: 'Settings' }).click();
      await page.locator('#name').waitFor();
      await page.locator('#name').click();
      await page.keyboard.type('Thaksen');
      await page.getByRole('button', { name: 'Save' }).click();
      await pause(300);
      await bar(page, 'finish');
    },
  });

  const text = fs.readFileSync(path.join(out, 'demo.yaml'), 'utf8');
  console.log(text);
  assert.ok(!text.includes('s3cret'), 'the password must never be written');
  assert.ok(text.includes('$DEMO_PASSWORD'), 'the password is replaced by $DEMO_PASSWORD');
  const d = loadDemoYaml(out);
  assert.strictEqual(d.steps.length, 3);
  const acts = d.steps.map((s) => s.actions.map((a) => `${a.type}:${JSON.stringify(a.value)}${a.within ? `@${a.within}` : ''}${a.nth ? `#${a.nth}` : ''}`));
  console.log(JSON.stringify(acts, null, 1));
  assert.ok(!acts[0].some((a) => a.startsWith('click:"Add"')), 'nothing recorded while paused');
  assert.ok(acts[0].includes('type:{"Email":"{{email}}"}'));
  assert.ok(acts[0].includes('check:"Remember me"'));
  assert.ok(acts[0].includes('select:{"Country":"Japan"}'));
  assert.ok(acts[0].includes('click:"Sign in"'));
  assert.ok(acts[1].some((a) => a === 'click:"Add"@Wishlist'), 'the second Add is told apart with within:');
  assert.ok(acts[2].includes('click:"Save"'));
  assert.strictEqual(d.data.email, 'tester@example.com');

  // The written file must play back. Only the recording step: no voice (offline), fake 3 s clips.
  fs.mkdirSync(path.join(out, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(out, 'audio', 'segments.json'), JSON.stringify({ segments: d.steps.map((s) => ({ id: s.id, scene: s.scene, file: 'x', duration: 3, cues: [] })) }));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'lib', 'yaml-flow.js'), out], {
    encoding: 'utf8', env: { ...process.env, DEMO_PASSWORD: 'anything' },
  });
  console.log(r.stdout, r.stderr);
  assert.strictEqual(r.status, 0, 'the recorded demo.yaml plays back');
  console.log(`OK: recorded and played back (${out})`);
})().catch((e) => { console.error(e); process.exit(1); });
