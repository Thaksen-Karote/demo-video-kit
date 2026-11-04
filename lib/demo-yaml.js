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
};

const hasDemoYaml = (demoDir) => fs.existsSync(path.join(demoDir, FILE));

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
  if (!Array.isArray(doc.steps) || !doc.steps.length) throw new Error(`${FILE} needs a "steps:" list`);

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
      const action = { ...options, type: names[0], value: a[names[0]], where: aw };
      if (action.value === null || action.value === undefined) throw new Error(`${aw}: "${action.type}" needs a value: ${ACTIONS[action.type]}`);
      if (action.type === 'type' && (typeof action.value !== 'object' || Array.isArray(action.value))) {
        throw new Error(`${aw}: type needs ${ACTIONS.type}`);
      }
      return env ? withEnv(action, aw) : action;
    });
    return { id, scene: step.scene || `Step ${i + 1}`, say: step.say.trim(), actions };
  });

  return {
    title: doc.title || path.basename(path.resolve(demoDir)),
    url: doc.url,
    voice: doc.voice,
    rate: doc.rate,
    pronounce: doc.pronounce || {},
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

module.exports = { FILE, ACTIONS, OPTIONS, hasDemoYaml, loadDemoYaml, narrationFromYaml, withEnv };
