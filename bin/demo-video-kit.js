#!/usr/bin/env node
/**
 * The demo-video-kit command.
 *
 *   demo-video-kit run <demo>            audio → record → render → verify, in one go
 *   demo-video-kit init <demo> --url U   a starter demo.yaml that already works on page U
 *   demo-video-kit doctor                checks what the kit needs on this machine
 *   (and each step on its own, plus voices and annotate; see `demo-video-kit help`)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HELP = `demo-video-kit: narrated, subtitled 1080p demo videos of web app workflows

Usage
  demo-video-kit init <demo> [--url <url>] [--js]
                                              make a starter demo (works right away):
                                              demo.yaml, or flow.cjs + narration.json with --js
  demo-video-kit record-steps <demo> --url <url> [--paused] [--force]
                                              use the app in a browser window; writes demo.yaml
  demo-video-kit run <demo> [--from <step>] [--voice <name>] [--rate <speed>] [--open]
                                              make the video: audio, record, render, verify
  demo-video-kit audio  <demo> [--voice <name>] [--rate <speed>]
                                              step 1: the narration → voice clips
  demo-video-kit record <demo>                step 2: run demo.yaml (or flow.cjs) in headless Chrome
  demo-video-kit render <demo>                step 3: video + voice + subtitles → <demo>.mp4
  demo-video-kit verify <demo>                step 4: check the format and silences
  demo-video-kit annotate <demo>              draw boxes from annotations.json (fallback)
  demo-video-kit voices [filter]              list voices, e.g. "voices en-US"
  demo-video-kit doctor                       check this machine

Options
  --from <step>   start "run" at audio, record, render or verify (reuses earlier output)
  --voice <name>  run, audio: use this voice for this run (e.g. en-GB-RyanNeural);
                  the file is not changed. See the names with "voices".
  --rate <speed>  run, audio: speaking speed for this run, e.g. +10% or -10%
  --open          play the video when it is done
  --js            init: write JavaScript (flow.cjs) instead of demo.yaml
  --paused        record-steps: start paused, to get the app ready first
  --force         record-steps: replace an existing demo.yaml

Environment
  DEMO_BASE_URL   the app's address (overrides "url:" in demo.yaml)
  DEMO_DEBUG      print details when something on the page cannot be boxed
  DEMO_BROWSER    chrome (default) or msedge
  Credentials: write $DEMO_PASSWORD (or any $NAME) in demo.yaml; values are read from the
  environment and never written to a file.
`;

const STEPS = ['audio', 'record', 'render', 'verify'];

const VALUE_OPTS = ['from', 'url', 'voice', 'rate'];

function parse(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--open') args.open = true;
    else if (a === '--js') args.js = true;
    else if (a === '--paused') args.paused = true;
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (VALUE_OPTS.includes(a.slice(2))) {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      args[a.slice(2)] = argv[++i];
    } else if (VALUE_OPTS.some((k) => a.startsWith(`--${k}=`))) { const at = a.indexOf('='); args[a.slice(2, at)] = a.slice(at + 1); }
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
    else args._.push(a);
  }
  return args;
}

function demoDir(name) {
  if (!name) throw new Error('Name the demo folder, e.g. "demo-video-kit run demos/signup"');
  const dir = path.resolve(name);
  if (!fs.existsSync(dir)) throw new Error(`No folder ${dir}. Make one with "demo-video-kit init ${name}"`);
  return dir;
}

function openFile(file) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', file]]
    : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

async function runSteps(dir, from = 'audio', { open, voice, rate } = {}) {
  const start = STEPS.indexOf(from);
  if (start < 0) throw new Error(`--from must be one of ${STEPS.join(', ')}`);
  // Why: the voice is made only in the audio step; skipping it would silently keep the old voice.
  if ((voice || rate !== undefined) && start > 0) throw new Error('--voice and --rate change the audio step, so they cannot be used with --from record, render or verify');
  const kit = require('../index');
  const t0 = Date.now();
  let warnings = [], checked;
  for (const [i, step] of STEPS.entries()) {
    if (i < start) continue;
    console.log(`\n▶ ${i + 1}/4 ${step}`);
    if (step === 'audio') await kit.generateAudio(dir, { voice, rate });
    if (step === 'record') warnings = kit.record(dir).warnings;
    if (step === 'render') kit.render(dir);
    if (step === 'verify') checked = kit.verify(dir);
  }
  const video = path.join(dir, `${path.basename(dir)}.mp4`);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (checked && !checked.ok) {
    console.log(`\n✗ ${video} was made, but it fails the checks above (${secs}s).`);
    console.log('  Fix: lengthen or split the narration of the silent part (its "say:" or "text"), then run again.');
    process.exitCode = 1;
  } else {
    if (warnings.length) console.log(`\n! ${warnings.length} recorder warning(s); see above.`);
    console.log(`\n✓ ${video} (${secs}s)`);
  }
  if (open) openFile(video);
}

function init(name, url, js) {
  if (!name) throw new Error('Name the new demo, e.g. "demo-video-kit init demos/signup --url http://localhost:3000"');
  const dir = path.resolve(name);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} already exists and is not empty`);
  fs.mkdirSync(dir, { recursive: true });
  const tpl = path.join(__dirname, '..', 'templates', js ? 'starter-js' : 'starter');
  const target = url || 'https://example.com/';
  for (const f of fs.readdirSync(tpl)) {
    const text = fs.readFileSync(path.join(tpl, f), 'utf8').replace(/__URL__/g, target).replace(/__NAME__/g, path.basename(dir));
    // Why: npm leaves .gitignore files out of published packages, so the template keeps it as "gitignore".
    fs.writeFileSync(path.join(dir, f === 'gitignore' ? '.gitignore' : f), text);
  }
  const rel = (path.relative(process.cwd(), dir) || '.').split(path.sep).join('/');
  console.log(js ? `Made ${rel}/ with narration.json (what to say) and flow.cjs (what to do), for ${target}`
    : `Made ${rel}/demo.yaml (what to say and do, step by step), for ${target}`);
  console.log('Its .gitignore keeps the generated audio, build files and video out of git.');
  console.log(`\nTry it now:\n  npx demo-video-kit run ${rel} --open\n\n${js ? 'Then edit both files for your workflow; each segment "id" in one matches a segment() in the other.'
    : 'Then edit demo.yaml for your workflow; the comments at its top list every action.'}`);
}

async function doctor() {
  let ok = true;
  const line = (good, what, fix) => { console.log(`${good ? '✓' : '✗'} ${what}${good || !fix ? '' : `\n    → ${fix}`}`); if (!good) ok = false; };
  const major = +process.versions.node.split('.')[0];
  line(major >= 18, `Node ${process.versions.node}`, 'Install Node 18 or newer from nodejs.org');
  try {
    const { ffmpegRaw } = require('../lib/ffmpeg');
    line(/ffmpeg version/.test(ffmpegRaw(['-version']).stdout), 'ffmpeg (bundled)', 'Reinstall the kit: npm install demo-video-kit');
  } catch (e) { line(false, 'ffmpeg (bundled)', e.message); }
  const { chromium } = require('playwright-core');
  let browser = null;
  for (const channel of ['chrome', 'msedge']) {
    try { const b = await chromium.launch({ channel, headless: true }); await b.close(); browser = channel; break; } catch (_) { /* try the next */ }
  }
  line(!!browser, browser ? `Browser: ${browser}${browser === 'msedge' ? ' (Chrome not found; Edge will be used)' : ''}` : 'Browser', 'Install Google Chrome');
  try {
    const voices = await require('../lib/audio').listVoices();
    line(voices.length > 0, `Voices: ${voices.length} available (internet works)`);
  } catch (e) { line(false, 'Voices (needs internet)', `Check the internet connection: ${e.message}`); }
  console.log(ok ? '\nAll set.' : '\nFix the ✗ lines, then run "demo-video-kit doctor" again.');
  if (!ok) process.exitCode = 1;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const [cmd, target] = args._;
  if (!cmd || args.help || cmd === 'help') { console.log(HELP); return; }
  const kit = () => require('../index');
  switch (cmd) {
    case 'run': return runSteps(demoDir(target), args.from, args);
    case 'init': return init(target, args.url, args.js);
    case 'record-steps': {
      if (!target) throw new Error('Name the demo folder, e.g. "demo-video-kit record-steps demos/signup --url http://localhost:3000"');
      const dir = path.resolve(target);
      const r = await require('../lib/recorder').recordSteps(dir, { url: args.url, paused: args.paused, force: args.force });
      const rel = (path.relative(process.cwd(), dir) || '.').split(path.sep).join('/');
      console.log(`
Next: rewrite the say: lines in ${rel}/demo.yaml, then
  npx demo-video-kit run ${rel} --open`);
      return r;
    }
    case 'doctor': return doctor();
    case 'audio': return kit().generateAudio(demoDir(target), { voice: args.voice, rate: args.rate });
    case 'record': return kit().record(demoDir(target));
    case 'render': return kit().render(demoDir(target));
    case 'verify': { const r = kit().verify(demoDir(target)); if (!r.ok) process.exitCode = 1; return r; }
    case 'annotate': return kit().annotate(demoDir(target));
    case 'voices': {
      const voices = await kit().listVoices(target || '');
      for (const v of voices) console.log(`${v.ShortName.padEnd(36)} ${v.Gender.padEnd(7)} ${v.Locale}`);
      return console.log(`\n${voices.length} voice(s). Use one as "voice:" in demo.yaml (or narration.json), or try it with "run <demo> --voice <name>".`);
    }
    default: throw new Error(`Unknown command "${cmd}". Run "demo-video-kit help".`);
  }
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
