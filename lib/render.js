/**
 * Step 3: the recording, the narration clips and the subtitles, joined into the final MP4.
 *
 * Reads  <demo>/build/timeline-raw.json and <demo>/audio/segments.json.
 * Writes <demo>/subtitles.srt, <demo>/scene-timeline.json and <demo>/<name>.mp4:
 * 1920x1080, 30 fps, H.264 + AAC, subtitles burned in, loudness normalised.
 */
const fs = require('fs');
const path = require('path');
const { ffmpeg } = require('./ffmpeg');

const LEAD_IN = 0.8;   // seconds of picture kept before the first narration starts
const MAX_CHARS = 84;  // longest subtitle cue before it is split
const WRAP = 56;       // subtitle line width

const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Long sentences become several cues, timed in proportion to their length. */
function splitCue(text, start, end) {
  if (text.length <= MAX_CHARS) return [[text, start, end]];
  const parts = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && cur.length + 1 + w.length > MAX_CHARS) { parts.push(cur); cur = w; } else cur = `${cur} ${w}`.trim();
  }
  parts.push(cur);
  const total = parts.reduce((a, p) => a + p.length, 0);
  let t = start;
  return parts.map((p) => { const d = (end - start) * p.length / total; const c = [p, t, t + d]; t += d; return c; });
}

function wrap(text, width = WRAP) {
  const lines = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; } else line = `${line} ${w}`.trim();
  }
  lines.push(line);
  return lines.join('\n');
}

const outputName = (demoDir) => `${path.basename(path.resolve(demoDir))}.mp4`;
const r3 = (n) => +n.toFixed(3);

function render(demoDir, { name = outputName(demoDir), log = console.log } = {}) {
  const rawFile = path.join(demoDir, 'build', 'timeline-raw.json');
  if (!fs.existsSync(rawFile)) throw new Error('No recording yet: run "demo-video-kit record <demo>" first');
  const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const clips = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(demoDir, 'audio', 'segments.json'), 'utf8'))
    .segments.map((s) => [s.id, s]));
  if (!raw.segments.length) throw new Error('The recording has no segments: flow.cjs called segment() zero times');
  const trim = Math.max(0, raw.segments[0].start - LEAD_IN);
  const length = raw.end - trim;

  const scenes = [], cues = [];
  for (const seg of raw.segments) {
    const clip = clips[seg.id];
    const start = seg.start - trim;
    const segCues = [];
    for (const c of clip.cues) {
      for (const [text, a, b] of splitCue(c.text, start + c.start, start + c.end)) segCues.push({ text, start: r3(a), end: r3(b) });
    }
    cues.push(...segCues);
    scenes.push({ id: seg.id, scene: seg.scene, narration: clip.text, audio: clip.file,
      start: r3(start), end: r3(seg.end - trim), audioStart: r3(start), audioEnd: r3(start + clip.duration), subtitles: segCues });
  }
  const marks = raw.marks.map((m) => ({ label: m.label, t: r3(m.t - trim) }));

  fs.writeFileSync(path.join(demoDir, 'subtitles.srt'),
    cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrap(c.text)}\n`).join('\n'));
  fs.writeFileSync(path.join(demoDir, 'scene-timeline.json'), JSON.stringify({
    video: name, duration: r3(length), trimmedFromRaw: r3(trim), result: raw.result || null,
    scenes, actionMarks: marks, recorderWarnings: raw.warnings || [],
  }, null, 2));

  const args = ['-ss', trim.toFixed(3), '-i', raw.videoFile.replace(/\\/g, '/')];
  for (const s of scenes) args.push('-i', s.audio);
  const delays = scenes.map((s, i) => `[${i + 1}:a]adelay=${Math.round(s.audioStart * 1000)}:all=1[a${i}];`).join('');
  const mix = scenes.map((_, i) => `[a${i}]`).join('');
  const style = 'FontName=Arial,FontSize=12,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=1,Shadow=0,MarginV=22';
  const graph = `[0:v]fps=30,scale=1920:1080:flags=lanczos,subtitles=subtitles.srt:force_style='${style}'[v];`
    + `${delays}${mix}amix=inputs=${scenes.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
  args.push('-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', length.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', name);
  // Runtime: paths are relative, so ffmpeg runs inside the demo folder (the subtitles filter cannot take Windows drive paths).
  ffmpeg(args, { cwd: demoDir });
  log(`  ${name}: ${length.toFixed(1)}s, ${cues.length} subtitles`);
  return { file: path.join(demoDir, name), duration: length, subtitles: cues.length };
}

module.exports = { render, outputName, srtTime, splitCue, wrap };
