/**
 * demo-video-kit: narrated, subtitled 1080p demo videos of web app workflows.
 *
 * In a flow.cjs:   const { runDemo } = require(process.env.DEMO_KIT || 'demo-video-kit');
 * From code:       await generateAudio(dir); record(dir); render(dir); verify(dir);
 * From a terminal: npx demo-video-kit run <demo-dir>
 */
const { runDemo, record } = require('./lib/record');
const { generateAudio, listVoices } = require('./lib/audio');
const { render } = require('./lib/render');
const { verify } = require('./lib/verify');
const { annotate } = require('./lib/annotate');

module.exports = { runDemo, generateAudio, record, render, verify, annotate, listVoices };
