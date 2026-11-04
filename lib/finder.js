/**
 * Finds elements by what a person sees: a button, link, field label, placeholder, title (tooltip)
 * or plain text with that wording, exact matches first. Shared by the player (yaml-flow.js),
 * which waits for its targets, and the recorder (recorder.js), which checks that the name it
 * writes finds the element that was really used.
 */
const FIND_TIMEOUT_MS = 10000;
const OPTIONAL_TIMEOUT_MS = 2000;
const CONTAINERS = 'div, section, article, form, fieldset, li, tr, main, aside, nav, header, footer, dialog';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageOf = (scope) => (typeof scope.page === 'function' ? scope.page() : scope);

async function firstVisible(loc) {
  const v = loc.filter({ visible: true });
  return (await v.count()) ? v : null;
}

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

/** How each action looks for its target, when it is not a plain click or point. */
const KINDS = {
  async type(s, f) {
    // Why: a field with no label or placeholder can still be named exactly, as "css=#id".
    if (f.startsWith('css=')) return firstVisible(s.locator(f.slice(4)));
    return (await firstVisible(s.getByLabel(f, { exact: true }))) || (await firstVisible(s.getByPlaceholder(f, { exact: true })))
      || (await firstVisible(s.getByRole('textbox', { name: f }))) || (await firstVisible(s.getByLabel(f))) || (await firstVisible(s.getByPlaceholder(f)));
  },
  async check(s, label) {
    return (await firstVisible(s.getByRole('checkbox', { name: label, exact: true })))
      || (await firstVisible(s.getByLabel(label, { exact: true })))
      // Why: many lists (TodoMVC) have a checkbox with no name, inside the row that shows the text.
      || (await firstVisible(s.locator(`li, tr, [role="row"], ${CONTAINERS}`).filter({ hasText: label }).last().getByRole('checkbox')));
  },
  async selectByLabel(s, f) {
    return (await firstVisible(s.getByLabel(f, { exact: true }))) || (await firstVisible(s.getByRole('combobox', { name: f })));
  },
  async selectByOption(s, option) {
    // Why: a dropdown with no label is found by the option it offers; nth: picks among several.
    // Runtime: a `has` locator must start from the page, not from the block it filters.
    return firstVisible(s.locator('select').filter({ has: pageOf(s).locator('option', { hasText: new RegExp(`^\\s*${escapeRe(String(option))}\\s*$`) }) }));
  },
  async text(s, text) {
    return firstVisible(s.getByText(text));
  },
};

/** The smallest block on the page that contains `text` and, when given, passes `test`. */
async function blockOf(p, text, test) {
  let list = p.locator(CONTAINERS).filter({ has: p.getByText(text, { exact: true }) });
  let n = await list.count();
  if (!n) { list = p.locator(CONTAINERS).filter({ hasText: text }); n = await list.count(); }
  // Why: matches come in document order, outer blocks first; the last is the innermost.
  for (let i = n - 1; i >= 0; i--) {
    const b = list.nth(i);
    if (!test || await test(b)) return b;
  }
  return null;
}

/** One attempt to find a target: { within, nth } as in demo.yaml; `kinds` overrides the plain search. */
async function locate(p, target, a = {}, kinds) {
  const match = async (scope) => {
    let found = null;
    if (target && typeof target === 'object') {
      if (target.css) found = await firstVisible(scope.locator(target.css));
      else if (target.testid) found = await firstVisible(scope.getByTestId(target.testid));
      else if (target.role) found = await firstVisible(scope.getByRole(target.role, target.name ? { name: target.name } : {}));
      else throw new Error(`${a.where || 'target'}: a target object needs css, testid or role`);
    } else if (kinds) {
      found = await kinds(scope, String(target));
    } else {
      for (const [, loc] of candidates(scope, String(target))) { found = await firstVisible(loc); if (found) break; }
    }
    if (!found) return null;
    if (a.nth) return a.nth > await found.count() ? null : found.nth(a.nth - 1);
    return found.first();
  };
  if (!a.within) return match(p);
  let hit = null;
  await blockOf(p, a.within, async (b) => !!(hit = await match(b)));
  return hit;
}

/** Finds the target of an action, waiting for the page, and explains clearly when nothing matches. */
async function find(p, target, a, { kinds } = {}) {
  const deadline = Date.now() + (a.optional ? OPTIONAL_TIMEOUT_MS : FIND_TIMEOUT_MS);
  const describe = typeof target === 'string' ? `"${target}"` : JSON.stringify(target);
  for (;;) {
    const hit = await locate(p, target, a, kinds);
    if (hit) return hit;
    if (Date.now() > deadline) {
      if (a.optional) return null;
      throw new Error(`${a.where}: nothing on the page matches ${describe}${a.within ? ` inside "${a.within}"` : ''}. `
        + 'Check the wording on screen, or add within:, nth: or { css: "..." }.');
    }
    await p.waitForTimeout(250);
  }
}

module.exports = { CONTAINERS, candidates, KINDS, blockOf, locate, find, firstVisible, escapeRe, pageOf };
