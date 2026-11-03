# demo-video-kit

Turn a web app workflow into a narrated, subtitled 1080p demo video with one command.

```bash
npx demo-video-kit init demos/signup --url http://localhost:3000
npx demo-video-kit run demos/signup --open
```

You write two small files: **what to say** (`narration.json`) and **what to do** (`flow.cjs`). The kit records the real app in headless Chrome with a visible cursor, click ripples and red highlight boxes. It voices the narration with free Edge neural voices, times every action to the voice, burns in subtitles, renders an MP4 and checks it.

It's only Node: no Python, no ffmpeg install, no API key. It also ships as a [Claude Code](https://claude.com/claude-code) **skill**, so an AI agent can write the two files for you.

## Features

- True 1920x1080, 30 fps, H.264 + AAC, recorded headless so nothing gets cut off
- A smooth, visible cursor with click ripples
- Live red boxes on whatever the narration talks about; they follow scrolling
- 300+ neural voices in many languages, with a pronunciation map
- Actions synced to each sentence of the narration; clips never overlap
- A built-in check: fails any video with 7 s or more of silence, and makes a contact sheet to look at

## Install

You need **Node 18+** and **Google Chrome** (or Microsoft Edge). Everything else comes with the package.

```bash
# in your project
npm install --save-dev github:Thaksen-Karote/demo-video-kit

# check the machine
npx demo-video-kit doctor
```

## Commands

| Command | Does |
|---|---|
| `init <demo> [--url <url>]` | Makes a starter demo folder that already works on that page |
| `run <demo> [--from <step>] [--open]` | Makes the video: audio → record → render → verify |
| `audio` / `record` / `render` / `verify <demo>` | One step on its own |
| `voices [filter]` | Lists voices, e.g. `voices hi-IN` |
| `doctor` | Checks Node, ffmpeg, the browser and the voices |
| `annotate <demo>` | Draws boxes on an already-made video from `annotations.json` (fallback) |

`--from render` reuses the earlier recording, which is handy when only subtitles or encoding changed. The video is `<demo>/<demo>.mp4`.

## What goes where

You write only two files per demo; everything else is made by the kit:

```
your-project/
├── demos/
│   └── signup/
│       ├── narration.json   ← you write: what the voice says
│       ├── flow.cjs         ← you write: what to click and type
│       ├── .gitignore       ← from init: keeps the files below out of git
│       ├── audio/  build/  subtitles.srt  scene-timeline.json
│       └── signup.mp4       ← the video
└── node_modules/demo-video-kit/   ← the kit (never edited)
```

Commit `narration.json` and `flow.cjs`; anyone can make the same video again with `npx demo-video-kit run demos/signup`.

## Versions

Pin a release so a later change can't break your demos:

```bash
npm install --save-dev github:Thaksen-Karote/demo-video-kit#v0.2.0
```

## Write your own demo

**`narration.json`** has one segment per step:

```json
{
  "voice": "en-IN-NeerjaNeural",
  "rate": "-4%",
  "pronounce": { "TodoMVC": "Todo M V C" },
  "segments": [
    { "id": "s1-login", "scene": "Sign in", "text": "We start by signing in with a test account." }
  ]
}
```

**`flow.cjs`** has the actions for each segment, which run while its narration plays:

```js
const { runDemo } = require(process.env.DEMO_KIT || 'demo-video-kit');

runDemo(__dirname, async ({ p, env, segment, click, type }) => {
  await p.goto(process.env.DEMO_BASE_URL || 'http://localhost:3000/login');
  await segment('s1-login', async (at, clip) => {
    await type(p.getByLabel('Email'), env.DEMO_EMAIL);
    await type(p.getByLabel('Password'), env.DEMO_PASSWORD);
    await at(clip.cues[0].end);                 // wait for the end of the first sentence
    await click(p.getByRole('button', { name: 'Sign in' }), { highlight: true });
  });
});
```

The helpers are `goto`, `click`, `type`, `pick` (dropdowns), `scrollBy`, `highlight`, `clearHighlights`, `pause` and `mark`. To find locators, click through your app with `npx playwright codegen <url>` and copy what it writes.

Pass credentials in environment variables; they are never written to a file. See [`examples/todomvc`](examples/todomvc) for a complete demo against a public site:

```bash
git clone https://github.com/Thaksen-Karote/demo-video-kit.git && cd demo-video-kit
npm install
npm run example
```

## Use from code

```js
const { generateAudio, record, render, verify } = require('demo-video-kit');
await generateAudio('demos/signup'); record('demos/signup'); render('demos/signup');
const { ok, problems } = verify('demos/signup');
```

## Use as a Claude Code skill

```bash
git clone https://github.com/Thaksen-Karote/demo-video-kit.git ~/.claude/skills/demo-video
cd ~/.claude/skills/demo-video && npm install
```

Then ask Claude Code: *"Create a demo video of signing up on localhost:3000."* `SKILL.md` holds the rules it follows.

## How it works

```
narration.json ── audio ──▶ audio/*.mp3 + sentence timings      (Edge TTS)
flow.cjs ──────── record ─▶ build/raw/*.webm + timeline         (Playwright, headless Chrome)
                  render ─▶ subtitles.srt + <demo>.mp4          (ffmpeg)
                  verify ─▶ pass/fail + build/check/contact-sheet.png
```

## Develop

```bash
npm test          # fast unit tests, no browser
npm run example   # the full pipeline on examples/todomvc
```

## Roadmap

- [x] One command, Node only
- [ ] `demo.yaml`: say and do in one file, no JavaScript
- [ ] `record`: click through the app once and get the flow written for you
- [ ] Zoom and pan on small UIs
- [ ] GIF and vertical (9:16) export
- [ ] Publish on npm; a GitHub Action that re-renders on every release

## License

[MIT](LICENSE)
