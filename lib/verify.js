/**
 * Step 4: checks the rendered video and makes a contact sheet to look at.
 *
 * Fails when the video is not 1920x1080 H.264 at 30 fps with AAC audio, or when any stretch without
 * narration reaches MAX_SILENCE seconds. Writes <demo>/build/check/contact-sheet.png: one frame
 * from the middle of every segment.
 */
const fs = require('fs');
const path = require('path');
const { ffmpeg, ffmpegRaw, probe } = require('./ffmpeg');
const { outputName } = require('./render');

const MAX_SILENCE = 7;

const silences = (video, min) => [...ffmpegRaw(['-hide_banner', '-i', video, '-af', `silencedetect=noise=-40dB:d=${min}`, '-f', 'null', '-'])
  .stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map(([, end, len]) => ({ end: +end, length: +len }));

function verify(demoDir, { name = outputName(demoDir), log = console.log } = {}) {
  const video = path.join(demoDir, name);
  if (!fs.existsSync(video)) throw new Error(`No ${name} yet: run "demo-video-kit render <demo>" first`);
  const problems = [];
  const info = probe(video);
  const v = info.match(/Video: (\w+).*?(\d{3,4})x(\d{3,4}).*?(\d+(?:\.\d+)?) fps/);
  const a = info.match(/Audio: (\w+)/);
  const d = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!v || v[1] !== 'h264' || v[2] !== '1920' || v[3] !== '1080' || +v[4] !== 30) {
    problems.push(`video is not 1920x1080 H.264 at 30 fps: ${v ? v.slice(1).join(' ') : 'no video stream'}`);
  }
  if (!a || a[1] !== 'aac') problems.push(`audio is not AAC: ${a ? a[1] : 'no audio stream'}`);
  for (const s of silences(video, MAX_SILENCE)) problems.push(`${s.length.toFixed(1)}s without narration, ending at ${s.end.toFixed(1)}s`);
  const longest = Math.max(0, ...silences(video, 2).map((s) => s.length));

  const timeline = JSON.parse(fs.readFileSync(path.join(demoDir, 'scene-timeline.json'), 'utf8'));
  const check = path.join(demoDir, 'build', 'check');
  fs.mkdirSync(check, { recursive: true });
  for (const f of fs.readdirSync(check)) if (f.endsWith('.png')) fs.unlinkSync(path.join(check, f));
  timeline.scenes.forEach((s, i) => ffmpeg(['-ss', ((s.start + s.end) / 2).toFixed(2), '-i', video,
    '-frames:v', '1', '-vf', 'scale=480:270', path.join(check, `${String(i).padStart(2, '0')}.png`)]));
  const cols = 4, rows = Math.ceil(timeline.scenes.length / cols);
  const sheet = path.join(check, 'contact-sheet.png');
  ffmpeg(['-framerate', '1', '-i', path.join(check, '%02d.png'), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', sheet]);

  const seconds = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0;
  log(`  ${name}: ${seconds.toFixed(1)}s, ${v ? `${v[2]}x${v[3]} ${v[1]} ${v[4]} fps` : '?'}, audio ${a ? a[1] : '?'}`);
  log(`  longest silence ${longest.toFixed(1)}s (limit ${MAX_SILENCE}s)`);
  log(`  contact sheet: ${sheet}`);
  for (const p of problems) log(`  FAIL ${p}`);
  return { ok: problems.length === 0, problems, duration: seconds, longestSilence: longest, sheet };
}

module.exports = { verify, MAX_SILENCE };
