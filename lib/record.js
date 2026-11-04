/**
 * Step 2: the recorder. A demo supplies only its flow (flow.cjs); this file supplies the browser,
 * the visible cursor, highlight boxes, scrolling helpers and the narration timing.
 *
 *   const { runDemo } = require(process.env.DEMO_KIT || 'demo-video-kit');
 *   runDemo(__dirname, async (k) => { await k.segment('s1-intro', async (at, clip) => { ... }); return { createdRecord: '...' }; });
 *
 * Records a fresh, headless Chrome at a true 1920x1080 (headless, so no screen size or display
 * scaling can cut the picture). Each `segment(id, actions)` starts its narration clip, runs the
 * actions while it plays, and lasts at least as long as the clip plus GAP_MS, so clips never
 * overlap. Writes <demoDir>/build/raw/*.webm and <demoDir>/build/timeline-raw.json.
 *
 * Environment: DEMO_BASE_URL (default http://localhost:3000), plus whatever credentials the flow
 * reads (for example DEMO_EMAIL, DEMO_PASSWORD). Credentials are never written to a file.
 * DEMO_BROWSER picks the installed browser: chrome (default) or msedge; when Chrome is missing,
 * Edge is tried, since every Windows machine has it.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const { openPage } = require('./open-page');

const W = 1920, H = 1080;
const GAP_MS = 500;           // silence between two narration clips
const MAX_SILENCE_S = 7;      // the skill's limit for any stretch without narration
const BASE = process.env.DEMO_BASE_URL || 'http://localhost:3000';

function cursorScript() {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-3px,-2px)' });
    document.body.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '@keyframes __rip{from{transform:translate(-50%,-50%) scale(.4);opacity:.8}to{transform:translate(-50%,-50%) scale(1.4);opacity:0}}';
    document.head.appendChild(st);
    const pos = window.__curPos || { x: 960, y: 540 };
    c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px';
    document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; try { sessionStorage.setItem('__cp', JSON.stringify({ x: e.clientX, y: e.clientY })); } catch (_) {} }, true);
    document.addEventListener('mousedown', e => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #f43f5e', background: 'rgba(244,63,94,.15)', zIndex: 2147483646, pointerEvents: 'none', animation: '__rip .6s ease-out forwards' });
      document.body.appendChild(r); setTimeout(() => r.remove(), 700);
    }, true);
    // Red highlight boxes: drawn over the given elements and kept on them every frame, so they follow scrolling.
    const boxes = new Map();
    const follow = () => {
      for (const [el, b] of boxes) {
        if (!el.isConnected) { b.remove(); boxes.delete(el); continue; }
        const r = el.getBoundingClientRect();
        Object.assign(b.style, { left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
      }
      requestAnimationFrame(follow);
    };
    window.__demoHighlight = (el) => {
      if (boxes.has(el)) return;
      const b = document.createElement('div');
      Object.assign(b.style, { position: 'fixed', boxSizing: 'border-box', border: '4px solid #E11D48', borderRadius: '4px', zIndex: 2147483645, pointerEvents: 'none' });
      document.body.appendChild(b); boxes.set(el, b);
    };
    window.__demoClearHighlights = () => { for (const b of boxes.values()) b.remove(); boxes.clear(); };
    requestAnimationFrame(follow);
  };
  try { const s = sessionStorage.getItem('__cp'); if (s) window.__curPos = JSON.parse(s); } catch (_) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
}

async function launchBrowser() {
  const wanted = process.env.DEMO_BROWSER || 'chrome';
  const channels = wanted === 'chrome' ? ['chrome', 'msedge'] : [wanted];
  let lastError;
  for (const channel of channels) {
    try { return await chromium.launch({ channel, headless: true }); } catch (e) { lastError = e; }
  }
  throw new Error(`Could not start ${channels.join(' or ')}. Install Google Chrome, or set DEMO_BROWSER=msedge.\n${lastError.message.split('\n')[0]}`);
}

async function runDemo(demoDir, flow) {
  const segFile = path.join(demoDir, 'audio', 'segments.json');
  if (!fs.existsSync(segFile)) throw new Error('No audio yet: run "demo-video-kit audio <demo>" first');
  const audio = JSON.parse(fs.readFileSync(segFile, 'utf8')).segments;
  const clip = Object.fromEntries(audio.map(s => [s.id, s]));
  const rawDir = path.join(demoDir, 'build', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: rawDir, size: { width: W, height: H } } });
  await context.addInitScript(cursorScript);
  const p = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const timeline = [], marks = [], warnings = [];

  const pause = ms => p.waitForTimeout(ms);
  const show = async (loc) => {
    await loc.waitFor({ state: 'visible', timeout: 30000 });
    await loc.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await pause(600);
    const b = await loc.boundingBox();
    if (b && (b.y < 0 || b.y + b.height > H)) { await loc.evaluate(e => e.scrollIntoView({ block: 'end', behavior: 'smooth' })); await pause(500); }
  };
  // Highlights. A box stays until the cursor moves on (the next goto, click, type or pick), until
  // clearHighlights(), or until its element leaves the page. `highlight` in the options below is
  // true (box the element the cursor goes to) or another locator (box that instead, e.g. its block).
  const clearHighlights = () => p.evaluate(() => window.__demoClearHighlights && window.__demoClearHighlights()).catch(() => {});
  const highlight = async (loc) => {
    await loc.first().evaluate(el => window.__demoHighlight && window.__demoHighlight(el))
      .catch((e) => { if (process.env.DEMO_DEBUG) console.log(`DEBUG highlight failed: ${e.message.split('\n')[0]}`); });
    mark(`highlight`);
  };
  const goto = async (loc, opts = {}) => {
    // Why: clear only once the target is in view, so the last box stays up until the cursor leaves it.
    await show(loc);
    if (!opts.keep) await clearHighlights();
    const b = await loc.boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
    if (opts.highlight) await highlight(opts.highlight === true ? loc : opts.highlight);
    await pause(250);
  };
  const click = async (loc, opts = {}) => { await goto(loc, opts); await loc.click(); await pause(600); };
  const type = async (loc, text, opts = {}) => { await click(loc, opts); await loc.pressSequentially(text, { delay: opts.delay ?? 32 }); await pause(300); };
  const pick = async (combo, option, opts = {}) => { await click(combo, opts); await pause(300); await click(p.getByRole('option', { name: option, exact: true }), { keep: !!opts.highlight }); await pause(200); };
  const scrollBy = async (dy, steps = 8) => { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await pause(90); } await pause(300); };
  const mark = (label) => marks.push({ label, t: +now().toFixed(3) });
  let lastEnd = null;

  const segment = async (id, actions) => {
    const c = clip[id]; if (!c) throw new Error(`No audio for segment "${id}": run generate_audio.py again`);
    const start = now();
    if (lastEnd !== null && start - lastEnd > MAX_SILENCE_S - 0.5) warnings.push(`${(start - lastEnd).toFixed(1)}s without narration before ${id}`);
    const at = async (s) => { const wait = (start + s - now()) * 1000; if (wait > 0) await pause(wait); };
    await actions(at, c);
    await at(c.duration + GAP_MS / 1000);
    const end = now();
    const over = end - start - c.duration;
    if (over > MAX_SILENCE_S - 0.5) warnings.push(`${id}: actions run ${over.toFixed(1)}s past its narration; lengthen or split it`);
    timeline.push({ id, scene: c.scene, start: +start.toFixed(3), end: +end.toFixed(3), audio: c.file, audioDuration: c.duration });
    lastEnd = start + c.duration;
    console.log(`${id.padEnd(16)} ${start.toFixed(1)}s -> ${end.toFixed(1)}s (clip ${c.duration}s)`);
  };

  const open = (url) => openPage(p, url); // retries a slow site, with a plain message when it fails
  const kit = { p, page: p, W, H, BASE, env: process.env, open, segment, goto, click, type, pick, pause, show, scrollBy, mark, now, highlight, clearHighlights };
  let result;
  try {
    result = await flow(kit);
  } finally {
    const end = now();
    await pause(0).catch(() => {});
    const videoPath = await p.video().path();
    await context.close(); await browser.close();
    fs.writeFileSync(path.join(demoDir, 'build', 'timeline-raw.json'), JSON.stringify({
      result: result || null, videoFile: path.relative(demoDir, videoPath), end: +end.toFixed(3),
      segments: timeline, marks, warnings,
    }, null, 2));
  }
  for (const w of warnings) console.log(`WARNING ${w}`);
  console.log(`Recorded; result ${JSON.stringify(result)}`);
  return result;
}

/** Playwright records video with its own small ffmpeg build; fetch it once if it is missing. */
function ensureRecorderFfmpeg(log = console.log) {
  const cli = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'install', 'ffmpeg'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Could not install Playwright's ffmpeg:\n${r.stderr || r.stdout}`);
  if (/download/i.test(r.stdout)) log('  installed the video recorder (one time)');
}

/**
 * Runs <demo>/flow.cjs in its own Node process, with DEMO_KIT pointing at this package, so a flow
 * works whether the kit is installed in the project, run with npx, or cloned.
 */
function record(demoDir, { log = console.log } = {}) {
  const flow = path.join(demoDir, 'flow.cjs');
  const yaml = path.join(demoDir, 'demo.yaml');
  const hasFlow = fs.existsSync(flow), hasYaml = fs.existsSync(yaml);
  if (hasFlow && hasYaml) throw new Error(`${demoDir} has both demo.yaml and flow.cjs; keep one`);
  if (!hasFlow && !hasYaml) throw new Error(`No demo.yaml or flow.cjs in ${demoDir}`);
  ensureRecorderFfmpeg(log);
  // Why: a demo.yaml runs through the kit's own flow; a flow.cjs is the user's code.
  const args = hasYaml ? [path.join(__dirname, 'yaml-flow.js'), demoDir] : [flow];
  const r = spawnSync(process.execPath, args, {
    cwd: demoDir, stdio: 'inherit',
    env: { ...process.env, DEMO_KIT: path.join(__dirname, '..', 'index.js') },
  });
  if (r.status !== 0) throw new Error(`${hasYaml ? "demo.yaml" : "flow.cjs"} failed (exit ${r.status}); see the error above`);
  const raw = JSON.parse(fs.readFileSync(path.join(demoDir, 'build', 'timeline-raw.json'), 'utf8'));
  return { warnings: raw.warnings || [], result: raw.result };
}

module.exports = { runDemo, record, W, H, MAX_SILENCE_S };
