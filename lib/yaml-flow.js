/**
 * Runs a demo.yaml in the browser: the built-in flow for demos that have no flow.cjs.
 * Started by record() as its own Node process:  node lib/yaml-flow.js <demo-dir>
 *
 * Targets are found by what a person sees: a button, link, field label, placeholder, title
 * (tooltip) or plain text with that wording, exact matches first.
 */
const path = require('path');
const { runDemo } = require('./record');
const { loadDemoYaml } = require('./demo-yaml');

const FIND_TIMEOUT_MS = 10000;
const OPTIONAL_TIMEOUT_MS = 2000;
const CONTAINERS = 'div, section, article, form, fieldset, li, tr, main, aside, nav, header, footer, dialog';

/** Every way a person might name an element, most precise first. */
function candidates(scope, text) {
  const ways = [];
  for (const exact of [true, false]) {
    ways.push(
      ['button', scope.getByRole('button', { name: text, exact })],
      ['link', scope.getByRole('link', { name: text, exact })],
      ['label', scope.getByLabel(text, { exact })],
      ['placeholder', scope.getByPlaceholder(text, { exact })],
      ['title', scope.getByTitle(text, { exact })],
      ['text', scope.getByText(text, { exact })],
    );
  }
  return ways;
}

/** The smallest block on the page that contains `text` and, when given, a match for `has`. */
async function blockOf(p, text, has) {
  const blocks = p.locator(CONTAINERS).filter({ has: p.getByText(text, { exact: true }) });
  let n = await blocks.count();
  if (!n) { const loose = p.locator(CONTAINERS).filter({ hasText: text }); n = await loose.count(); if (!n) return null; return pick(loose, n, has); }
  return pick(blocks, n, has);
  async function pick(list, count, test) {
    // Why: matches come in document order, outer blocks first; the last is the innermost.
    for (let i = count - 1; i >= 0; i--) {
      const b = list.nth(i);
      if (!test || await test(b)) return b;
    }
    return null;
  }
}

async function firstVisible(loc) {
  const v = loc.filter({ visible: true });
  return (await v.count()) ? v : null;
}

/** Finds the target of an action, waiting for the page, and explains clearly when nothing matches. */
async function find(p, target, a, { kinds } = {}) {
  const deadline = Date.now() + (a.optional ? OPTIONAL_TIMEOUT_MS : FIND_TIMEOUT_MS);
  const describe = typeof target === 'string' ? `"${target}"` : JSON.stringify(target);
  for (;;) {
    let scope = p;
    if (a.within) {
      scope = await blockOf(p, a.within, async (b) => !!(await match(b)));
    }
    const hit = scope ? await match(scope) : null;
    if (hit) return hit;
    if (Date.now() > deadline) {
      if (a.optional) return null;
      throw new Error(`${a.where}: nothing on the page matches ${describe}${a.within ? ` inside "${a.within}"` : ''}. `
        + 'Check the wording on screen, or add within:, nth: or { css: "..." }.');
    }
    await p.waitForTimeout(250);
  }

  async function match(scope) {
    let found = null;
    if (target && typeof target === 'object') {
      if (target.css) found = await firstVisible(scope.locator(target.css));
      else if (target.testid) found = await firstVisible(scope.getByTestId(target.testid));
      else if (target.role) found = await firstVisible(scope.getByRole(target.role, target.name ? { name: target.name } : {}));
      else throw new Error(`${a.where}: a target object needs css, testid or role`);
    } else if (kinds) {
      found = await kinds(scope, String(target));
    } else {
      for (const [, loc] of candidates(scope, String(target))) { found = await firstVisible(loc); if (found) break; }
    }
    if (!found) return null;
    if (a.nth) {
      const n = await found.count();
      if (a.nth > n) return null;
      return found.nth(a.nth - 1);
    }
    return found.first();
  }
}

const highlightOf = async (p, a, target) => {
  if (!a.highlight) return undefined;
  if (a.highlight === 'block') {
    if (!a.within) throw new Error(`${a.where}: highlight: block needs within:`);
    return (await blockOf(p, a.within)) || undefined;
  }
  return a.highlight === true ? target : undefined;
};

/** A native <select> has options as data; a custom dropdown shows role=option items to click. */
async function chooseOption(k, combo, option, a) {
  const opts = { highlight: await highlightOf(k.p, a, combo), keep: a.keep };
  const native = await combo.evaluate((el) => el.tagName === 'SELECT');
  if (native) {
    await k.goto(combo, opts);
    await k.pause(400);
    await combo.selectOption({ label: String(option) });
    await k.pause(1200); // the chosen value stays on screen long enough to read
  } else {
    await k.pick(combo, String(option), opts);
  }
}

const ACTIONS = {
  async open(k, a, base) {
    await k.clearHighlights();
    await k.p.goto(new URL(String(a.value), base).toString());
    await k.p.locator('body').waitFor();
    await k.pause(800);
  },
  async click(k, a) {
    const t = await find(k.p, a.value, a); if (!t) return;
    await k.click(t, { highlight: await highlightOf(k.p, a, t), keep: a.keep });
  },
  async point(k, a) {
    const t = await find(k.p, a.value, a); if (!t) return;
    await k.goto(t, { highlight: await highlightOf(k.p, a, t), keep: a.keep });
    await k.pause(600);
  },
  async type(k, a) {
    for (const [field, text] of Object.entries(a.value)) {
      const t = await find(k.p, field, a, { kinds: async (s, f) => (await firstVisible(s.getByLabel(f, { exact: true })))
        || (await firstVisible(s.getByPlaceholder(f, { exact: true }))) || (await firstVisible(s.getByRole('textbox', { name: f })))
        || (await firstVisible(s.getByLabel(f))) || (await firstVisible(s.getByPlaceholder(f))) });
      if (!t) continue;
      await k.type(t, String(text), { highlight: await highlightOf(k.p, a, t), keep: a.keep, delay: a.delay });
    }
  },
  async press(k, a) {
    await k.p.keyboard.press(String(a.value));
    await k.pause(500);
  },
  async check(k, a) {
    const t = await find(k.p, a.value, a, { kinds: async (s, label) => (await firstVisible(s.getByRole('checkbox', { name: label, exact: true })))
      || (await firstVisible(s.getByLabel(label, { exact: true })))
      // Why: many lists (TodoMVC) have a checkbox with no name, inside the row that shows the text.
      || (await firstVisible(s.locator(`li, tr, [role="row"], ${CONTAINERS}`).filter({ hasText: label }).last().getByRole('checkbox'))) });
    if (!t) return;
    const box = await highlightOf(k.p, a, t);
    if (!(await t.isChecked())) await k.click(t, { highlight: box, keep: a.keep });
    else await k.goto(t, { highlight: box, keep: a.keep });
  },
  async select(k, a) {
    const pairs = typeof a.value === 'object' ? Object.entries(a.value) : [[null, a.value]];
    for (const [field, option] of pairs) {
      const t = await find(k.p, field ?? option, a, { kinds: async (s, f) => field
        ? (await firstVisible(s.getByLabel(f, { exact: true }))) || (await firstVisible(s.getByRole('combobox', { name: f })))
        // Why: a dropdown with no label is found by the option it offers; nth: picks among several.
        // Runtime: a `has` locator must start from the page, not from the block it filters.
        : await firstVisible(s.locator('select').filter({ has: pageOf(s).locator('option', { hasText: new RegExp(`^\\s*${escapeRe(String(option))}\\s*$`) }) })) });
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
    const t = await find(k.p, a.value, { ...a, optional: false, where: `${a.where} (expect)` }, { kinds: async (s, text) => firstVisible(s.getByText(text)) });
    if (a.highlight) await k.goto(t, { highlight: await highlightOf(k.p, a, t), keep: a.keep });
  },
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageOf = (scope) => (typeof scope.page === 'function' ? scope.page() : scope);

async function main(demoDir) {
  const demo = loadDemoYaml(demoDir, { env: true });
  const base = process.env.DEMO_BASE_URL || demo.url;
  if (!base) throw new Error('demo.yaml needs "url:" (or set DEMO_BASE_URL)');
  await runDemo(demoDir, async (k) => {
    k.p.on('dialog', (d) => d.accept().catch(() => {})); // Runtime: headless pages cannot show alerts; accept them so the flow goes on.
    await k.p.goto(base);
    await k.p.locator('body').waitFor();
    await k.pause(800);
    for (const step of demo.steps) {
      await k.segment(step.id, async (at, clip) => {
        for (const a of step.actions) await ACTIONS[a.type](k, a, base, at, clip);
      });
    }
    await k.clearHighlights();
    await k.pause(1500);
    return { steps: demo.steps.length, page: await k.p.title() };
  });
}

if (require.main === module) {
  main(path.resolve(process.argv[2] || '.')).catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}

module.exports = { candidates, ACTIONS, find };
