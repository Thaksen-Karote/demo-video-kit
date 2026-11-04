/**
 * record-steps: you use your app once in a real browser window, and this writes demo.yaml.
 *
 * In the page, a small script reports each click, typed value, key and dropdown choice, and shows
 * a control bar (Pause / New step / Finish). Here, each action gets the name a person would use,
 * checked with the same finder the player uses: the name must find the very element that was used,
 * otherwise within: or nth: is added. So what is written plays back.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { locate, KINDS } = require('./finder');
const { openPage } = require('./open-page');
const { FILE } = require('./demo-yaml');

/* ------------------------------------------------------------------ in the page */

function pageScript() {
  if (window !== window.top || window.__dvkInstalled) return;
  window.__dvkInstalled = true;

  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const send = (ev) => {
    if (!window.__dvkEvent) return;
    window.__dvkEvent(ev).then((st) => st && window.__dvkShow && window.__dvkShow(st)).catch(() => {});
  };
  const fromBar = (e) => e.composedPath().some((n) => n && n.id === '__dvk_bar');

  const mark = (el) => {
    if (!el.getAttribute('data-dvk-id')) el.setAttribute('data-dvk-id', Math.random().toString(36).slice(2, 10));
    return el.getAttribute('data-dvk-id');
  };
  const ownText = (el) => clean([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
  const labelOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) return clean(by.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' '));
    if (el.labels && el.labels[0]) {
      // Why: a field inside its <label> would otherwise take the field's own text along (a dropdown's options).
      const copy = el.labels[0].cloneNode(true);
      copy.querySelectorAll('input, select, textarea, option').forEach((n) => n.remove());
      return clean(copy.textContent);
    }
    return '';
  };
  /** True when no other visible element on the page shows exactly this text: used when the page moves on too fast to check. */
  const onlyOne = (text) => {
    if (!text) return false;
    let n = 0;
    const all = document.body.querySelectorAll('*');
    for (let i = 0; i < all.length && i < 5000; i++) {
      const c = all[i];
      if (c.closest('#__dvk_bar') || !c.getClientRects().length || clean(c.innerText) !== text) continue;
      if ([...c.children].some((ch) => clean(ch.innerText) === text)) continue; // count only the innermost
      if (++n > 1) return false;
    }
    return n === 1;
  };
  const CONTAINERS = 'DIV,SECTION,ARTICLE,FORM,FIELDSET,LI,TR,MAIN,ASIDE,NAV,HEADER,FOOTER,DIALOG'.split(',');
  /** Short visible titles of the blocks around an element, innermost first: candidates for within:. */
  const blockTexts = (el) => {
    const out = [];
    for (let b = el.parentElement; b && b !== document.body && out.length < 4; b = b.parentElement) {
      if (!CONTAINERS.includes(b.tagName)) continue;
      const all = b.querySelectorAll('*');
      for (let i = 0; i < all.length && i < 300; i++) {
        const c = all[i];
        if (c === el || c.contains(el) || el.contains(c)) continue;
        const t = ownText(c);
        if (t.length >= 2 && t.length <= 40 && /[A-Za-z]/.test(t)) { if (!out.includes(t)) out.push(t); break; }
      }
    }
    return out;
  };
  const describe = (el) => ({
    id: mark(el),
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || '').toLowerCase(),
    text: clean(el.innerText || el.textContent || '').slice(0, 120),
    aria: clean(el.getAttribute('aria-label')),
    title: clean(el.getAttribute('title')),
    placeholder: clean(el.getAttribute('placeholder')),
    label: labelOf(el),
    value: el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) ? clean(el.value) : '',
    testid: el.getAttribute('data-testid') || '',
    elId: el.id || '',
    row: clean((el.closest('li, tr, [role="row"]') || {}).innerText || '').split(' ').slice(0, 6).join(' '),
    blocks: blockTexts(el),
    unique: onlyOne(clean(el.innerText || '').slice(0, 120)),
  });

  const TEXTLIKE = /^(|text|email|search|tel|url|number|password)$/;
  const isField = (el) => el && ((el.tagName === 'INPUT' && TEXTLIKE.test((el.getAttribute('type') || '').toLowerCase()))
    || el.tagName === 'TEXTAREA' || el.isContentEditable);
  const valueOf = (el) => (el.isContentEditable ? el.innerText : el.value);
  const pending = new Map(), sent = new WeakMap();
  const flush = (el) => {
    if (!pending.has(el)) return;
    const v = pending.get(el); pending.delete(el);
    if (sent.get(el) === v || v === '') return;
    sent.set(el, v);
    send({ kind: 'type', el: describe(el), value: v, password: el.type === 'password' });
  };
  const flushAll = () => { for (const el of [...pending.keys()]) flush(el); };

  const CLICKABLE = 'button, a[href], [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=switch], '
    + 'input[type=submit], input[type=button], input[type=reset], summary, [onclick], [title], [data-testid]';

  document.addEventListener('click', (e) => {
    if (!e.isTrusted || fromBar(e)) return;
    const raw = e.target instanceof Element ? e.target : null;
    if (!raw) return;
    // Fields, dropdowns and checkboxes are recorded by what they end up holding, not by the click.
    if (isField(raw) || raw.closest('select') || raw.matches('input[type=checkbox], input[type=radio]')) return;
    const lab = raw.closest('label');
    if (lab && lab.querySelector('input[type=checkbox], input[type=radio], select')) return;
    flushAll();
    let el = raw.closest(CLICKABLE);
    if (!el) { const t = ownText(raw); if (!t || t.length > 60) return; el = raw; }
    send({ kind: 'click', el: describe(el) });
  }, true);

  document.addEventListener('input', (e) => { if (isField(e.target) && !fromBar(e)) pending.set(e.target, valueOf(e.target)); }, true);
  document.addEventListener('focusout', (e) => { if (isField(e.target)) flush(e.target); }, true);
  // Why: field changes are taken even when a script fired them; some apps (and Playwright) do.
  document.addEventListener('change', (e) => {
    if (fromBar(e)) return;
    const el = e.target;
    if (isField(el)) return flush(el);
    if (el.tagName === 'SELECT') {
      const opt = el.options[el.selectedIndex];
      return send({ kind: 'select', el: describe(el), option: clean(opt ? opt.text : el.value) });
    }
    if (el.matches && el.matches('input[type=checkbox], input[type=radio]')) send({ kind: el.checked ? 'check' : 'click', el: describe(el) });
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!e.isTrusted || fromBar(e) || !['Enter', 'Escape', 'Tab'].includes(e.key)) return;
    const inField = isField(document.activeElement);
    if (inField) flush(document.activeElement);
    if (e.key === 'Tab' && !inField) return;
    if (e.key === 'Tab') return; // moving between fields is not a step worth showing
    send({ kind: 'press', key: e.key });
  }, true);
  window.addEventListener('pagehide', flushAll);

  /* The control bar, in its own shadow root so the page's styles cannot reach it. */
  const install = () => {
    if (document.getElementById('__dvk_bar')) return;
    const host = document.createElement('div');
    host.id = '__dvk_bar';
    Object.assign(host.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647 });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .bar{font:13px/1.3 system-ui,sans-serif;background:#111827;color:#f9fafb;border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.35);min-width:300px}
      .row{display:flex;gap:6px;align-items:center}
      button{font:inherit;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;background:#374151;color:#f9fafb}
      button:hover{background:#4b5563}
      .finish{background:#16a34a}.finish:hover{background:#15803d}
      .dot{width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:2px}
      .paused .dot{background:#9ca3af}
      .state{font-weight:600;margin-right:auto}
      .info{margin-top:6px;color:#d1d5db;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}
    </style>
    <div class="bar"><div class="row"><span class="dot"></span><span class="state">Recording</span>
      <button class="toggle" data-cmd="toggle">Pause</button><button data-cmd="step">New step</button><button class="finish" data-cmd="finish">Finish</button></div>
      <div class="info">Step 1 · 0 actions</div></div>`;
    root.addEventListener('click', (e) => {
      const cmd = e.target.closest && e.target.closest('button') && e.target.closest('button').dataset.cmd;
      if (cmd) { flushAll(); send({ kind: 'control', cmd }); }
    });
    document.documentElement.appendChild(host);
    window.__dvkShow = (st) => {
      const bar = root.querySelector('.bar');
      bar.classList.toggle('paused', !st.recording);
      root.querySelector('.state').textContent = st.recording ? 'Recording' : 'Paused (not recording)';
      root.querySelector('.toggle').textContent = st.recording ? 'Pause' : 'Record';
      root.querySelector('.info').textContent = st.info;
    };
    send({ kind: 'hello' });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
}

/* ------------------------------------------------------------------ naming */

const usable = (s, max = 60) => typeof s === 'string' && s.length > 0 && s.length <= max;
const uniq = (list) => [...new Set(list.filter(Boolean))];

/** Names to try for an element, in the order a person would use them. */
function namesFor(kind, d) {
  if (kind === 'type') return uniq([d.label, d.placeholder, d.aria].filter((s) => usable(s)));
  if (kind === 'check') return uniq([d.label, d.aria, d.row].filter((s) => usable(s)));
  if (kind === 'select') return uniq([d.label, d.aria].filter((s) => usable(s)));
  return uniq([d.text, d.aria, d.title, d.value, d.label, d.placeholder].filter((s) => usable(s)));
}

const KIND_FINDER = { type: KINDS.type, check: KINDS.check, select: KINDS.selectByLabel };

/**
 * The shortest target that finds this very element: the name alone, then inside a nearby block,
 * then with nth:; then its test id or id. `ok: false` when the page moved on before it could be checked.
 */
async function nameElement(page, kind, d, { option } = {}) {
  const isIt = async (loc) => !!loc && (await loc.getAttribute('data-dvk-id', { timeout: 500 }).catch(() => null)) === d.id;
  const stillThere = await page.locator(`[data-dvk-id="${d.id}"]`).count().catch(() => 0);
  const tries = namesFor(kind, d).map((n) => [n, KIND_FINDER[kind], false]);
  if (kind === 'select') tries.push([option, KINDS.selectByOption, true]); // an unlabelled dropdown, by the option it offers

  if (stillThere) {
    // Why: "within: Wishlist" reads better and survives page changes better than "nth: 2", so blocks come first.
    for (const nths of [[undefined], [2, 3, 4, 5, 6, 7, 8]]) {
      for (const [name, kinds, byOption] of tries) {
        // With nth:, counting inside a block ("the 3rd in Set Timer") is clearer than across the page.
        for (const within of nths[0] ? [...d.blocks, undefined] : [undefined, ...d.blocks]) {
          for (const nth of nths) {
            const loc = await locate(page, name, { within, nth }, kinds).catch(() => null);
            if (!loc) break;
            if (await isIt(loc)) return { name, within, nth, byOption, ok: true };
          }
        }
      }
    }
    for (const t of [d.testid && { testid: d.testid }, d.elId && /^[A-Za-z][\w-]*$/.test(d.elId) && { css: `#${d.elId}` }].filter(Boolean)) {
      if (kind !== 'click' && kind !== 'check') break;
      if (await isIt(await locate(page, t, {}).catch(() => null))) return { name: t, ok: true };
    }
  }
  // Why: the click opened another page (or redrew this one) before the name could be checked.
  // The page said, at the moment of the click, that no other element showed this text: good enough.
  const [name, , byOption] = tries[0] || [d.elId ? { css: `#${d.elId}` } : d.text || '?'];
  return { name, byOption, ok: !stillThere && name === d.text && d.unique };
}

/* ------------------------------------------------------------------ writing demo.yaml */

const q = (v) => JSON.stringify(String(v));
const scalar = (v) => (typeof v === 'string' && /^[A-Za-z][\w .,'()/-]*$/.test(v) && !/: |#|^(yes|no|true|false|null|on|off)$/i.test(v) ? v : q(v));
const flowTarget = (t) => (typeof t === 'string' ? scalar(t) : `{ ${Object.entries(t).map(([k, v]) => `${k}: ${q(v)}`).join(', ')} }`);
const spoken = (t) => (typeof t === 'string' ? t : 'here');

function dataKey(field, used) {
  const base = (typeof field === 'string' ? field : 'value').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'value';
  let k = /^[a-z_]/.test(base) ? base : `field_${base}`;
  for (let i = 2; used.has(k) || ['today', 'time', 'timestamp', 'random'].includes(k); i++) k = `${base}_${i}`;
  used.add(k);
  return k;
}

/** demo.yaml as text, with draft narration to rewrite and a data: section for the values typed. */
function writeYaml({ url, steps }) {
  const data = [];
  const used = new Set();
  const lines = [];
  steps.forEach((actions, i) => {
    const said = [];
    const body = [];
    for (const a of actions) {
      const opts = [];
      if (a.within) opts.push(`within: ${scalar(a.within)}`);
      if (a.nth) opts.push(`nth: ${a.nth}`);
      if (a.highlight) opts.push('highlight: true');
      const note = a.ok === false ? '  # check: the page changed before this name could be verified' : '';
      let head;
      if (a.kind === 'click') { head = `click: ${flowTarget(a.name)}`; said.push(`We click ${spoken(a.name)}.`); }
      else if (a.kind === 'check') { head = `check: ${flowTarget(a.name)}`; said.push(`We tick ${spoken(a.name)}.`); }
      else if (a.kind === 'select') {
        head = a.byOption ? `select: ${q(a.option)}` : `select: { ${q(a.name)}: ${q(a.option)} }`;
        said.push(a.byOption ? `We choose ${a.option}.` : `We choose ${a.option} for ${a.name}.`);
      } else if (a.kind === 'type') {
        const field = typeof a.name === 'string' ? a.name : `css=${a.name.css}`;
        let value;
        if (a.password) value = '$DEMO_PASSWORD';
        else { const k = dataKey(a.name, used); data.push([k, a.value]); value = `{{${k}}}`; }
        head = `type: { ${q(field)}: ${q(value)} }`;
        said.push(a.password ? 'We enter the password.' : `We enter the ${spoken(a.name).toLowerCase()}.`);
      } else if (a.kind === 'press') { head = `press: ${a.key}`; if (a.key !== 'Enter') said.push(`We press ${a.key}.`); }
      else if (a.kind === 'open') { head = `open: ${q(a.path)}`; said.push(`We go to ${a.path}.`); }
      body.push(`      - ${head}${note}`);
      for (const o of opts) body.push(`        ${o}`);
    }
    lines.push(`  - scene: Step ${i + 1}`);
    lines.push(`    say: ${q(said.join(' ') || 'Rewrite this narration.')}  # TODO: rewrite in your own words`);
    if (body.length) { lines.push('    do:'); lines.push(...body); }
    lines.push('');
  });

  const out = [
    '# Written by "demo-video-kit record-steps". Rewrite each say: line in your own words,',
    '# then make the video:  npx demo-video-kit run <this folder> --open',
    '# The values you typed are under data:; passwords are never saved: they come from $DEMO_PASSWORD.',
    '',
    `url: ${q(url)}`,
    'voice: en-IN-NeerjaNeural',
    'rate: -4%',
    '',
  ];
  if (data.length) {
    out.push('data:');
    for (const [k, v] of data) out.push(`  ${k}: ${q(v)}`);
    out.push('');
  }
  out.push('steps:', ...lines);
  return out.join('\n');
}

/* ------------------------------------------------------------------ the session */

async function launchHeaded(headless) {
  const channels = process.env.DEMO_BROWSER ? [process.env.DEMO_BROWSER] : ['chrome', 'msedge'];
  let last;
  for (const channel of channels) {
    try { return await chromium.launch({ channel, headless, args: headless ? [] : ['--start-maximized'] }); } catch (e) { last = e; }
  }
  throw new Error(`Could not start ${channels.join(' or ')}: ${last.message.split('\n')[0]}`);
}

/**
 * Opens <url> in a visible browser, records until Finish (or the window is closed, or Ctrl+C),
 * then writes <demoDir>/demo.yaml. `drive(page)` replaces the person, for tests.
 */
async function recordSteps(demoDir, { url, paused = false, force = false, headless = false, drive, log = console.log } = {}) {
  if (!url) throw new Error('Give the page to start on: --url https://...');
  const file = path.join(demoDir, FILE);
  if (fs.existsSync(file) && !force) throw new Error(`${file} already exists. Choose a new folder, or add --force to replace it`);
  fs.mkdirSync(demoDir, { recursive: true });

  const steps = [[]];
  let recording = !paused;
  let lastActionAt = 0;
  let lastUrl = null;
  let finished;
  const done = new Promise((r) => { finished = r; });
  const info = (extra) => `Step ${steps.length} · ${steps.at(-1).length} action${steps.at(-1).length === 1 ? '' : 's'}${extra ? ` · ${extra}` : ''}`;
  let lastNote = '';
  const state = () => ({ recording, info: info(lastNote) });

  const browser = await launchHeaded(headless);
  const context = await browser.newContext(headless ? { viewport: { width: 1920, height: 1080 } } : { viewport: null });
  let chain = Promise.resolve();

  const describeAction = (a) => {
    const t = (x) => (typeof x === 'string' ? x : JSON.stringify(x));
    if (a.kind === 'type') return `type into ${t(a.name)}`;
    if (a.kind === 'select') return `choose ${a.option}`;
    if (a.kind === 'press') return `press ${a.key}`;
    if (a.kind === 'open') return `open ${a.path}`;
    return `${a.kind} ${t(a.name)}${a.within ? ` (in ${a.within})` : ''}${a.nth ? ` #${a.nth}` : ''}`;
  };
  const add = (a) => {
    steps.at(-1).push(a);
    lastNote = `✓ ${describeAction(a)}`;
    log(`  step ${steps.length}: ${describeAction(a)}${a.ok === false ? '  (not verified)' : ''}`);
  };

  const handle = async (page, ev) => {
    if (ev.kind === 'hello') return state();
    if (ev.kind === 'control') {
      if (ev.cmd === 'toggle') { recording = !recording; lastNote = recording ? 'recording again' : 'paused'; log(`  ${recording ? 'recording' : 'paused'}`); }
      if (ev.cmd === 'step' && steps.at(-1).length) { steps.push([]); lastNote = 'new step'; log(`  -- step ${steps.length}`); }
      if (ev.cmd === 'finish') finished('finish');
      return state();
    }
    if (!recording) return state();
    lastActionAt = Date.now();
    if (ev.kind === 'press') add({ kind: 'press', key: ev.key });
    else {
      const named = await nameElement(page, ev.kind, ev.el, { option: ev.option });
      add({ kind: ev.kind, ...named, option: ev.option, value: ev.value, password: ev.password, highlight: ev.kind !== 'type' });
    }
    return state();
  };
  await context.exposeBinding('__dvkEvent', ({ page }, ev) => {
    const r = chain.then(() => handle(page, ev));
    chain = r.catch(() => {});
    return r.catch((e) => { log(`  could not record an action: ${e.message.split('\n')[0]}`); return state(); });
  });
  await context.addInitScript(pageScript);

  const page = await context.newPage();
  context.on('page', (p) => { if (p !== page) log('  a new tab opened; only the first tab is recorded'); });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    const now = frame.url();
    // Why: a page change soon after a click or Enter is that action's result; otherwise you typed a new address.
    if (lastUrl && now !== lastUrl && recording && Date.now() - lastActionAt > 2500) {
      const base = new URL(url);
      const u = new URL(now);
      const p = u.origin === base.origin ? `${u.pathname}${u.search}${u.hash}` : now;
      chain = chain.then(() => { if (steps.at(-1).length) steps.push([]); add({ kind: 'open', path: p }); });
    }
    lastUrl = now;
  });
  browser.on('disconnected', () => finished('closed'));
  page.on('close', () => finished('closed'));
  const onSigint = () => finished('interrupted');
  process.once('SIGINT', onSigint);

  log(`Opening ${url}`);
  await openPage(page, url);
  lastUrl = page.url();
  log(paused
    ? 'Paused: get the app ready, then press Record on the bar at the bottom right.'
    : 'Recording. Use the app; the bar at the bottom right has Pause, New step and Finish.');
  if (drive) drive(page).catch((e) => { log(`  drive failed: ${e.message}`); finished('error'); });

  const why = await done;
  process.removeListener('SIGINT', onSigint);
  await chain;
  await browser.close().catch(() => {});

  const kept = steps.filter((s) => s.length);
  if (!kept.length) throw new Error('Nothing was recorded, so no demo.yaml was written');
  fs.writeFileSync(file, writeYaml({ url, steps: kept }));
  const gi = path.join(demoDir, '.gitignore');
  if (!fs.existsSync(gi)) fs.copyFileSync(path.join(__dirname, '..', 'templates', 'starter', 'gitignore'), gi);
  const actions = kept.reduce((n, s) => n + s.length, 0);
  const unchecked = kept.flat().filter((a) => a.ok === false).length;
  log(`\nWrote ${file}: ${kept.length} step(s), ${actions} action(s)${why === 'finish' ? '' : ` (${why})`}`);
  if (unchecked) log(`  ${unchecked} action(s) marked "# check:" could not be verified; look at them before running.`);
  return { file, steps: kept.length, actions, unchecked };
}

module.exports = { recordSteps, writeYaml, namesFor, dataKey };
