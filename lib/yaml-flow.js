/**
 * Runs a demo.yaml in the browser: the built-in flow for demos that have no flow.cjs.
 * Started by record() as its own Node process:  node lib/yaml-flow.js <demo-dir>
 *
 * Targets are found by what a person sees (see finder.js).
 */
const path = require('path');
const { runDemo } = require('./record');
const { loadDemoYaml } = require('./demo-yaml');
const { find, blockOf, KINDS } = require('./finder');
const { openPage } = require('./open-page');

const highlightOf = async (p, a, target) => {
  if (!a.highlight) return undefined;
  if (a.highlight === 'block') {
    if (!a.within) throw new Error(`${a.where}: highlight: block needs within:`);
    return (await blockOf(p, a.within)) || undefined;
  }
  return a.highlight === true ? target : undefined;
};

/**
 * Zoom for an action: its own zoom: if it has one, else the demo's. "block" frames the within: block.
 * Why: only actions that point at something zoom; open, press, wait and scroll never do.
 */
let demoZoom = false;
const zoomOf = async (p, a) => {
  const z = a.zoom ?? demoZoom;
  if (!z) return {};
  if (z === 'block') return { zoom: true, zoomOn: (await blockOf(p, a.within)) || undefined };
  return { zoom: z };
};
const opts = async (k, a, target) => ({ highlight: await highlightOf(k.p, a, target), keep: a.keep, ...(await zoomOf(k.p, a)) });

/** A native <select> has options as data; a custom dropdown shows role=option items to click. */
async function chooseOption(k, combo, option, a) {
  const o = await opts(k, a, combo);
  const native = await combo.evaluate((el) => el.tagName === 'SELECT');
  if (native) {
    await k.goto(combo, o);
    await k.pause(400);
    await combo.selectOption({ label: String(option) });
    await k.pause(1200); // the chosen value stays on screen long enough to read
  } else {
    await k.pick(combo, String(option), o);
  }
}

const ACTIONS = {
  async open(k, a, base) {
    await k.clearHighlights();
    await openPage(k.p, new URL(String(a.value), base).toString());
    await k.pause(800);
  },
  async click(k, a) {
    const t = await find(k.p, a.value, a); if (!t) return;
    await k.click(t, await opts(k, a, t));
  },
  async point(k, a) {
    const t = await find(k.p, a.value, a); if (!t) return;
    await k.goto(t, await opts(k, a, t));
    await k.pause(600);
  },
  async type(k, a) {
    for (const [field, text] of Object.entries(a.value)) {
      const t = await find(k.p, field, a, { kinds: KINDS.type });
      if (!t) continue;
      await k.type(t, String(text), { ...(await opts(k, a, t)), delay: a.delay });
    }
  },
  async press(k, a) {
    await k.p.keyboard.press(String(a.value));
    await k.pause(500);
  },
  async check(k, a) {
    const t = await find(k.p, a.value, a, { kinds: KINDS.check });
    if (!t) return;
    const o = await opts(k, a, t);
    if (!(await t.isChecked())) await k.click(t, o);
    else await k.goto(t, o);
  },
  async select(k, a) {
    const pairs = typeof a.value === 'object' ? Object.entries(a.value) : [[null, a.value]];
    for (const [field, option] of pairs) {
      const t = await find(k.p, field ?? option, a, { kinds: field ? KINDS.selectByLabel : KINDS.selectByOption });
      if (!t) continue;
      await chooseOption(k, t, option, a);
    }
  },
  async scroll(k, a) {
    const v = a.value;
    if (typeof v === 'number') return k.scrollBy(v);
    if (v === 'down' || v === 'up') return k.scrollBy(v === 'down' ? 500 : -500);
    if (v === 'top' || v === 'bottom') { await k.p.evaluate((d) => window.scrollTo({ top: d === 'top' ? 0 : document.body.scrollHeight, behavior: 'smooth' }), v); return k.pause(900); }
    const t = await find(k.p, v, a); if (t) await k.goto(t, { highlight: await highlightOf(k.p, a, t), keep: a.keep });
  },
  // (scrolling never zooms: the point of a scroll is to see more of the page)
  async wait(k, a, base, at, clip) {
    const v = a.value;
    if (typeof v === 'number') return k.pause(v * 1000);
    if (v && typeof v === 'object' && 'sentence' in v) {
      const cue = clip.cues[v.sentence - 1];
      if (!cue) throw new Error(`${a.where}: this step's narration has ${clip.cues.length} sentence(s), not ${v.sentence}`);
      return at(cue.end);
    }
    await find(k.p, v, a);
  },
  async expect(k, a) {
    const t = await find(k.p, a.value, { ...a, optional: false, where: `${a.where} (expect)` }, { kinds: KINDS.text });
    if (a.highlight || a.zoom) await k.goto(t, await opts(k, a, t));
  },
};

async function main(demoDir) {
  const demo = loadDemoYaml(demoDir, { env: true });
  demoZoom = demo.zoom;
  const base = process.env.DEMO_BASE_URL || demo.url;
  if (!base) throw new Error('demo.yaml needs "url:" (or set DEMO_BASE_URL)');
  await runDemo(demoDir, async (k) => {
    k.p.on('dialog', (d) => d.accept().catch(() => {})); // Runtime: headless pages cannot show alerts; accept them so the flow goes on.
    await openPage(k.p, base);
    await k.pause(800);
    for (const step of demo.steps) {
      await k.segment(step.id, async (at, clip) => {
        for (const a of step.actions) await ACTIONS[a.type](k, a, base, at, clip);
      });
    }
    await k.clearHighlights();
    await k.zoomOut();
    await k.pause(1500);
    return { steps: demo.steps.length, page: await k.p.title() };
  });
}

if (require.main === module) {
  main(path.resolve(process.argv[2] || '.')).catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}

module.exports = { ACTIONS };
