// The web view for the browser tests: `skill-atlas serve`, with GitHub answering from
// tests/helpers.ts and Claude being the fake claude -p of tests/claude/, so a page looks the same on
// every run and needs no network.
import { claude } from '../../src/claude.ts';
import { createWebServer, listen } from '../../src/web.ts';
import { FAKE_CLAUDE, opener } from '../helpers.ts';

const port = Number(process.argv[2] ?? 4174);
console.log(`Skill Atlas at ${await listen(createWebServer({ open: opener(), cluster: claude({ command: FAKE_CLAUDE.topics }) }), port)}`);
