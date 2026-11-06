/**
 * demo.yaml: the words and the actions of a demo in one file, no JavaScript.
 *
 *   url: https://example.com/
 *   voice: en-IN-NeerjaNeural
 *   steps:
 *     - say: We start the stopwatch.
 *       do:
 *         - click: Start
 *           within: Stopwatch
 *           highlight: true
 *
 * This module reads and checks the file. lib/yaml-flow.js runs it in the browser.
 */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const FILE = 'demo.yaml';

/** Each action, and what its value may be. */
const ACTIONS = {
  open: 'a URL or a path on the site, e.g. /login',
  click: 'the text, label or title of what to click',
  point: 'the text of what to point the cursor at',
  type: 'a map { field: text }, e.g. { Email: $DEMO_EMAIL }',
  press: 'a key, e.g. Enter or Tab',
  check: 'the label (or row text) of a checkbox',
  select: 'a map { dropdown: option }, or just the option text',
  scroll: 'down, up, a number of pixels, or text to scroll to',
  wait: 'seconds, text to wait for, or { sentence: N }',
  expect: 'text that must be on screen (the run fails otherwise)',
};
/** Options any action may carry. */
const OPTIONS = {
  within: 'only look inside the block that contains this text',
  nth: 'when several match, which one (1 is the first)',
  highlight: 'true (box the target) or "block" (box the whole within block)',
  keep: 'keep the boxes from earlier actions',
  optional: 'skip this action instead of failing when nothing matches',
  delay: 'type only: milliseconds per key',
  zoom: 'true (2x), how much (1.2 to 4), block (frame the within block), or false',
};

/** zoom: true, false, "block", or a number from 1.2 to 4; for the whole demo or one action. */
function checkZoom(v, where) {
  if (v === undefined || v === true || v === false || v === 'block') return;
  if (typeof v === 'number' && v >= 1.2 && v <= 4) return;
  throw new Error(`${where}: zoom must be true, false, block, or a number from 1.2 to 4 (found ${JSON.stringify(v)})`);
}

const TOP_KEYS = ['title', 'url', 'voice', 'rate', 'pronounce', 'data', 'zoom', 'steps'];
const hasDemoYaml = (demoDir) => fs.existsSync(path.join(demoDir, FILE));

/**
 * Values that change on every run, for {{name}} in actions. Why: every run really creates its
 * record, and a fixed title can clash with the one made last time ("name already taken").
 * Each is worked out once per run, so an expect: later in the same run sees the same value.
 */
function builtins(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const time = `${p(now.getHours())}:${p(now.getMinutes())}`;
  return {
    today: date,
    time,
    timestamp: `${date.replace(/-/g, '')}-${time.replace(':', '')}${p(now.getSeconds())}`,
    random: String(1000 + Math.floor(Math.random() * 9000)),
  };
}
const BUILTINS = Object.keys(builtins());
const VAR = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g;

/** Every {{name}} used in a value (strings, and keys and values of maps). */
function varsIn(value, out = []) {
  if (typeof value === 'string') for (const m of value.matchAll(VAR)) out.push(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => varsIn(v, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { varsIn(k, out); varsIn(v, out); });
  return out;
}

/** Fills in {{name}} only (for say:, which holds no $NAME). */
function withVars(value, vars) {
  if (typeof value === 'string') return value.replace(VAR, (_, n) => vars[n]);
  if (Array.isArray(value)) return value.map((v) => withVars(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [withVars(k, vars), withVars(v, vars)]));
  return value;
}

/**
 * Fills in $NAME (environment) and {{name}} (vars) in one pass over the text as written.
 * Why one pass: what is filled in is never scanned again, so a password such as "a$B{{x}}c" is
 * typed exactly as it is, instead of having its "{{x}}" replaced.
 */
const TOKEN = /\{\{\s*([A-Za-z_][\w-]*)\s*\}\}|\$([A-Z_][A-Z0-9_]*)/g;
function fill(value, vars, where) {
  if (typeof value === 'string') {
    return value.replace(TOKEN, (_, v, env) => {
      if (v !== undefined) return vars[v];
      if (process.env[env] === undefined) throw new Error(`${where}: set the environment variable ${env}`);
      return process.env[env];
    });
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, vars, where));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [fill(k, vars, where), fill(v, vars, where)]));
  return value;
}

function readData(doc) {
  const data = doc.data ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error(`${FILE}: "data:" must be a map, e.g. data: { title: Cement order }`);
  for (const [k, v] of Object.entries(data)) {
    if (!/^[A-Za-z_][\w-]*$/.test(k)) throw new Error(`${FILE} data: "${k}" is not a usable name (letters, digits, _ and -)`);
    if (BUILTINS.includes(k)) throw new Error(`${FILE} data: "${k}" is a built-in value; choose another name`);
    if (v === null || typeof v === 'object') throw new Error(`${FILE} data: "${k}" needs a single value, not a list or map`);
    const inner = varsIn(String(v)).filter((n) => !BUILTINS.includes(n));
    if (inner.length) throw new Error(`${FILE} data: "${k}" uses {{${inner[0]}}}; data values can use only ${BUILTINS.map((b) => `{{${b}}}`).join(', ')}`);
  }
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
}

/** Replaces $NAME with the environment variable; a missing one is an error naming it. */
function withEnv(value, where) {
  if (typeof value === 'string') {
    return value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name) => {
      if (process.env[name] === undefined) throw new Error(`${where}: set the environment variable ${name}`);
      return process.env[name];
    });
  }
  if (Array.isArray(value)) return value.map((v) => withEnv(v, where));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [withEnv(k, where), withEnv(v, where)]));
  return value;
}

/** Reads demo.yaml, checks every step and action, and returns it in a normal shape. */
function loadDemoYaml(demoDir, { env = false } = {}) {
  const file = path.join(demoDir, FILE);
  let doc;
  try {
    doc = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${FILE} is not valid YAML: ${e.message.split('\n')[0]}`);
  }
  if (!doc || typeof doc !== 'object') throw new Error(`${FILE} is empty`);
  const strange = Object.keys(doc).filter((k) => !TOP_KEYS.includes(k));
  if (strange.length) throw new Error(`${FILE}: unknown key "${strange[0]}" (the top level has ${TOP_KEYS.join(', ')})`);
  if (!Array.isArray(doc.steps) || !doc.steps.length) throw new Error(`${FILE} needs a "steps:" list`);
  const data = readData(doc);
  checkZoom(doc.zoom, `${FILE} zoom`);
  if (doc.zoom === 'block') throw new Error(`${FILE} zoom: "block" is for one action (with within:); at the top use true or a number`);
  const known = [...BUILTINS, ...Object.keys(data)];
  let vars = null;
  if (env) {
    // Runtime: the built-ins are worked out once per run; fill() does $NAME and {{name}} in one pass (see there).
    const b = builtins();
    const dataValues = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fill(v, b, `${FILE} data: ${k}`)]));
    vars = { ...b, ...dataValues };
  }

  const ids = new Set();
  const steps = doc.steps.map((step, i) => {
    const where = `${FILE} step ${i + 1}`;
    if (!step || typeof step.say !== 'string' || !step.say.trim()) throw new Error(`${where}: every step needs "say:" (what the voice says)`);
    const unknown = Object.keys(step).filter((k) => !['say', 'do', 'scene', 'id'].includes(k));
    if (unknown.length) throw new Error(`${where}: unknown key "${unknown[0]}" (a step has say, do, and optionally scene and id)`);
    const id = String(step.id || `step-${i + 1}`);
    if (ids.has(id)) throw new Error(`${where}: id "${id}" is used twice`);
    ids.add(id);
    if (step.do !== undefined && !Array.isArray(step.do)) throw new Error(`${where}: "do:" must be a list of actions`);
    const actions = (step.do || []).map((a, j) => {
      const aw = `${where}, action ${j + 1}`;
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${aw}: write an action as "- click: Save"`);
      const names = Object.keys(a).filter((k) => k in ACTIONS);
      if (names.length !== 1) {
        throw new Error(`${aw}: ${names.length ? `only one action per item (found ${names.join(', ')})` : `no action; use one of ${Object.keys(ACTIONS).join(', ')}`}`);
      }
      const bad = Object.keys(a).filter((k) => !(k in ACTIONS) && !(k in OPTIONS));
      if (bad.length) throw new Error(`${aw}: unknown option "${bad[0]}" (options: ${Object.keys(OPTIONS).join(', ')})`);
      const options = Object.fromEntries(Object.entries(a).filter(([k]) => k in OPTIONS));
      checkZoom(options.zoom, aw);
      if (options.zoom === 'block' && !options.within) throw new Error(`${aw}: zoom: block needs within: (the block to frame)`);
      const action = { ...options, type: names[0], value: a[names[0]], where: aw };
      if (action.value === null || action.value === undefined) throw new Error(`${aw}: "${action.type}" needs a value: ${ACTIONS[action.type]}`);
      if (action.type === 'type' && (typeof action.value !== 'object' || Array.isArray(action.value))) {
        throw new Error(`${aw}: type needs ${ACTIONS.type}`);
      }
      const unknownVar = varsIn(action.value).find((n) => !known.includes(n));
      if (unknownVar) throw new Error(`${aw}: {{${unknownVar}}} is not in data: (or a built-in: ${BUILTINS.join(', ')})`);
      return env ? fill(action, vars, aw) : action;
    });
    // Why: the voice is made in an earlier step than the recording, so narration may use only fixed data.
    for (const n of varsIn(step.say)) {
      if (!(n in data) || varsIn(data[n]).length || data[n].includes('$')) {
        throw new Error(`${where}: say: can use {{${n}}} only if it is a fixed value in data: (no $NAME or built-ins)`);
      }
    }
    return { id, scene: step.scene || `Step ${i + 1}`, say: withVars(step.say.trim(), data), actions };
  });

  return {
    title: doc.title || path.basename(path.resolve(demoDir)),
    url: doc.url,
    voice: doc.voice,
    rate: doc.rate,
    pronounce: doc.pronounce || {},
    zoom: doc.zoom ?? false,
    data,
    steps,
  };
}

/** The narration part of demo.yaml, in the same shape as narration.json. */
function narrationFromYaml(demoDir) {
  const d = loadDemoYaml(demoDir);
  const spec = { title: d.title, pronounce: d.pronounce, segments: d.steps.map((s) => ({ id: s.id, scene: s.scene, text: s.say })) };
  if (d.voice) spec.voice = d.voice;
  if (d.rate) spec.rate = d.rate;
  return spec;
}

module.exports = { FILE, ACTIONS, OPTIONS, BUILTINS, builtins, hasDemoYaml, loadDemoYaml, narrationFromYaml, withEnv, withVars, fill };
