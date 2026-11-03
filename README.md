# demo-video-kit

Turn a web app workflow into a narrated, subtitled 1080p demo video, automatically.

You write two small files: **what to say** (`narration.json`) and **what to click** (`flow.cjs`). The kit records the real app in headless Chrome, with a visible cursor, click ripples and red highlight boxes, then voices the narration with Edge TTS, times every action to the voice, burns in subtitles, and renders an MP4. It also checks the result.

It also works as a [Claude Code](https://claude.com/claude-code) **skill**: ask Claude "create a demo video of the checkout flow" and it does the dry run, writes the two files, records, renders and verifies.

## Features

- True 1920x1080, 30 fps, H.264 + AAC, recorded headless so nothing gets cut off
- Smooth, visible cursor with click ripples
- Live red boxes on what the narration talks about; they follow scrolling
- Neural voices from Edge TTS (free, no API key), with a pronunciation map
- Actions synced to each sentence of the narration; clips never overlap
- `verify.py` fails any video with more than 7 s of silence, and makes a contact sheet to check by eye

## Quick start

Needs Node 18+, Python 3.10+, Google Chrome and internet access (for the voices).

```bash
git clone https://github.com/Thaksen-Karote/demo-video-kit.git
cd demo-video-kit
npm install
python -m pip install edge-tts imageio-ffmpeg
node node_modules/playwright-core/cli.js install ffmpeg

# The bundled example: the public TodoMVC app
python scripts/generate_audio.py examples/todomvc   # 1. narration -> audio clips
node examples/todomvc/flow.cjs                       # 2. record the browser
python scripts/render.py examples/todomvc            # 3. video + voice + subtitles -> MP4
python scripts/verify.py examples/todomvc            # 4. check format, gaps, contact sheet
```

Result: `examples/todomvc/todomvc-final.mp4`.

## Make your own demo

Copy `examples/todomvc/` and edit both files.

**`narration.json`** has one segment per step:

```json
{
  "voice": "en-IN-NeerjaNeural",
  "rate": "-4%",
  "pronounce": { "TodoMVC": "Todo M V C" },
  "segments": [
    { "id": "s1-intro", "scene": "Scene 1: The app", "text": "This is TodoMVC..." }
  ]
}
```

**`flow.cjs`** gives each segment the actions to run while its narration plays:

```js
await segment('s3-complete', async (at, clip) => {
  await click(item('Write the README').getByRole('checkbox'), { highlight: true });
  await at(clip.cues[0].end);            // wait for the end of the first sentence
  await goto(page.getByTestId('todo-count'), { highlight: true });
});
```

Helpers: `goto`, `click`, `type`, `pick` (dropdowns), `scrollBy`, `highlight`, `clearHighlights`, `pause`, `mark`. Set `DEMO_BASE_URL` for your app, and pass any credentials through environment variables; they are never written to a file.

List the voices with `python -m edge_tts --list-voices`.

## Use as a Claude Code skill

```bash
git clone https://github.com/Thaksen-Karote/demo-video-kit.git ~/.claude/skills/demo-video
cd ~/.claude/skills/demo-video && npm install
```

Then ask Claude Code: *"Create a demo video of signing up on localhost:3000."* `SKILL.md` holds the rules it follows.

## How it works

```
narration.json ──generate_audio.py──▶ audio/*.mp3 + sentence timings
                                             │
flow.cjs + demo-kit.cjs ──record──▶ build/raw/*.webm + timeline-raw.json
                                             │
                     render.py ──▶ subtitles.srt + <name>-final.mp4
                                             │
                     verify.py ──▶ pass/fail + build/check/contact-sheet.png
```

## Roadmap

- [ ] One command: `npx demo-video-kit run <demo-dir>`
- [ ] Zoom and pan on small UIs
- [ ] GIF and vertical (9:16) export
- [ ] Intro and outro title cards, chapter markers
- [ ] Draft a `flow.cjs` from a `playwright codegen` recording
- [ ] CI that renders the example on every push

## License

[MIT](LICENSE)
