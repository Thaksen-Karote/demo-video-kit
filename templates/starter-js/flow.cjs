/**
 * What the demo does. One segment('<id>') per segment in narration.json: its actions run while that
 * narration plays. Make the video with:  npx demo-video-kit run <this folder>
 *
 * Helpers (all move the visible cursor first):
 *   click(locator, { highlight: true })        click, with a red box on the target
 *   type(locator, 'text')                      click a field and type into it
 *   pick(comboboxLocator, 'Option name')       choose from a dropdown
 *   goto(locator, { highlight: true })         point at something without clicking
 *   scrollBy(pixels), pause(ms), clearHighlights()
 *   at(seconds)                                inside a segment: wait until that point of its narration
 *
 * Find locators by clicking through the app with:  npx playwright codegen <url>
 * Credentials: read them from env (e.g. env.DEMO_PASSWORD); never write them in this file.
 */
const { runDemo } = require(process.env.DEMO_KIT || 'demo-video-kit');

const URL = process.env.DEMO_BASE_URL || '__URL__';

runDemo(__dirname, async ({ p, W, H, env, segment, goto, click, type, pick, pause, scrollBy, clearHighlights }) => {
  await p.goto(URL);
  await p.locator('body').waitFor();
  await pause(800);

  await segment('s1-intro', async (at, clip) => {
    await p.mouse.move(W * 0.5, H * 0.5, { steps: 25 });
    await at(clip.cues[0].end); // after the first sentence
    const heading = p.locator('h1, h2').first();
    if (await heading.count()) await goto(heading, { highlight: true });
    // Example of a real step:
    // await click(p.getByRole('link', { name: 'Sign in' }), { highlight: true });
  });

  await segment('s2-explore', async () => {
    await clearHighlights();
    await scrollBy(500);
    await pause(1500);
    await scrollBy(500);
    // Example: await type(p.getByLabel('Email'), env.DEMO_EMAIL);
  });

  await segment('s3-end', async () => {
    await scrollBy(-1000);
    await pause(800);
  });

  return { page: await p.title() };
}).catch((e) => { console.error(e); process.exit(1); });
