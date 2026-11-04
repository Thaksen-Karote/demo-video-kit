/**
 * Step 1: one narration clip per segment with Edge TTS, and each sentence's timing.
 *
 * Reads  <demo>/narration.json: { title, voice, rate, pronounce: {written: spoken}, segments: [{id, scene, text}] }
 * Writes <demo>/audio/<id>.mp3, <demo>/audio/segments.json and <demo>/narration-script.txt.
 * Needs internet access (Microsoft's free Edge voices; no account or key).
 */
const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { duration } = require('./ffmpeg');
const { hasDemoYaml, narrationFromYaml } = require('./demo-yaml');

const DEFAULT_VOICE = 'en-IN-NeerjaNeural';

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const splitSentences = (text) => text.trim().split(/(?<=[.!?])\s+/);

function readNarration(demoDir) {
  const file = path.join(demoDir, 'narration.json');
  let spec;
  if (hasDemoYaml(demoDir)) spec = narrationFromYaml(demoDir);
  else if (fs.existsSync(file)) spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  else throw new Error(`No demo.yaml or narration.json in ${demoDir}. Make one with "demo-video-kit init"`);
  if (!Array.isArray(spec.segments) || !spec.segments.length) throw new Error('narration.json has no segments');
  const ids = new Set();
  for (const s of spec.segments) {
    if (!s.id || !s.text) throw new Error(`Every segment needs an "id" and a "text": ${JSON.stringify(s)}`);
    if (ids.has(s.id)) throw new Error(`Segment id "${s.id}" is used twice`);
    ids.add(s.id);
  }
  return { voice: DEFAULT_VOICE, rate: '+0%', pronounce: {}, ...spec };
}

/** Speaks one segment into <id>.mp3 and returns its clip entry for segments.json. */
async function synth(tts, segment, spec, audioDir) {
  let said = segment.text;
  for (const [written, spoken] of Object.entries(spec.pronounce)) said = said.split(written).join(spoken);
  const file = path.join(audioDir, `${segment.id}.mp3`);

  const { audioStream, metadataStream } = tts.toStream(escapeXml(said), { rate: spec.rate });
  let meta = '';
  metadataStream.on('data', (d) => { meta += d.toString(); });
  const out = fs.createWriteStream(file);
  await new Promise((resolve, reject) => {
    audioStream.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    audioStream.pipe(out);
  });

  // Why: the metadata arrives as one JSON message per sentence, possibly joined; read the numbers directly.
  const sentences = [...meta.matchAll(/"Offset":\s*(\d+),\s*"Duration":\s*(\d+)/g)]
    .map(([, o, d]) => ({ start: +o / 1e7, end: (+o + +d) / 1e7 }));
  const length = +duration(file).toFixed(3);
  const written = splitSentences(segment.text);
  const cues = written.length === sentences.length
    ? written.map((text, i) => ({ text, ...sentences[i] }))
    : [{ text: segment.text, start: 0, end: length }];
  return { id: segment.id, scene: segment.scene || segment.id, text: segment.text,
    file: `audio/${segment.id}.mp3`, duration: length, cues };
}

async function generateAudio(demoDir, { log = console.log } = {}) {
  const spec = readNarration(demoDir);
  const audioDir = path.join(demoDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(spec.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { sentenceBoundaryEnabled: true });
  const results = [];
  try {
    for (const s of spec.segments) {
      const r = await synth(tts, s, spec, audioDir);
      results.push(r);
      log(`  ${r.id.padEnd(18)} ${r.duration.toFixed(2).padStart(6)}s  ${r.cues.length} sentence(s)`);
    }
  } finally {
    tts.close();
  }

  fs.writeFileSync(path.join(audioDir, 'segments.json'),
    JSON.stringify({ voice: spec.voice, rate: spec.rate, segments: results }, null, 2));
  const lines = [`${spec.title || path.basename(demoDir)}: narration script`, `Voice: ${spec.voice}, rate ${spec.rate}`, ''];
  let scene = null;
  for (const r of results) {
    if (r.scene !== scene) { scene = r.scene; lines.push('', scene, '-'.repeat(scene.length)); }
    lines.push(`[${r.id}, ${r.duration.toFixed(1)}s] ${r.text}`);
  }
  fs.writeFileSync(path.join(demoDir, 'narration-script.txt'), lines.join('\n') + '\n');
  const total = results.reduce((a, r) => a + r.duration, 0);
  log(`  total narration ${total.toFixed(1)}s, voice ${spec.voice}`);
  return { segments: results, total };
}

/** All Edge voices, optionally filtered by text in their name or locale. */
async function listVoices(filter = '') {
  const voices = await new MsEdgeTTS().getVoices();
  const f = filter.toLowerCase();
  return voices.filter((v) => !f || v.ShortName.toLowerCase().includes(f) || v.Locale.toLowerCase().includes(f));
}

module.exports = { generateAudio, listVoices, readNarration, splitSentences, escapeXml, DEFAULT_VOICE };
