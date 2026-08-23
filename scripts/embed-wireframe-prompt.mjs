import { readFile, writeFile } from 'node:fs/promises';

const uiPath = new URL('../ui.html', import.meta.url);
const promptPath = new URL('../AI_WIREFRAME_PROMPT_EN.md', import.meta.url);
const [ui, prompt] = await Promise.all([
  readFile(uiPath, 'utf8'),
  readFile(promptPath, 'utf8'),
]);

const start = '/* AI_WIREFRAME_PROMPT_START */';
const end = '/* AI_WIREFRAME_PROMPT_END */';
const startIndex = ui.indexOf(start);
const endIndex = ui.indexOf(end);
if (startIndex < 0 || endIndex < startIndex) throw new Error('Could not find the wireframe prompt markers in ui.html.');

const embedded = `${start}\n      ${JSON.stringify(prompt)}\n      ${end}`;
await writeFile(uiPath, ui.slice(0, startIndex) + embedded + ui.slice(endIndex + end.length), 'utf8');
