// The web view for the browser tests: `skill-atlas serve`, with GitHub answering from
// tests/helpers.ts, so a page looks the same on every run and needs no network.
import { createWebServer, listen } from '../../src/web.ts';
import { opener } from '../helpers.ts';

const port = Number(process.argv[2] ?? 4174);
console.log(`Skill Atlas at ${await listen(createWebServer({ open: opener() }), port)}`);
