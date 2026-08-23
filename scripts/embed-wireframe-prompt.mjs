import { readFile, writeFile } from 'node:fs/promises';

const uiPath = new URL('../ui.html', import.meta.url);
const promptPath = new URL('../AI_WIREFRAME_PROMPT_EN.md', import.meta.url);
const imagePromptPath = new URL('../AI_IMAGE_PROMPT_EN.md', import.meta.url);
const [ui, prompt, imagePrompt] = await Promise.all([
  readFile(uiPath, 'utf8'),
  readFile(promptPath, 'utf8'),
  readFile(imagePromptPath, 'utf8'),
]);

function embedPrompt(source, start, end, value) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) throw new Error(`Could not find prompt markers: ${start}`);
  const embedded = `${start}\n      ${JSON.stringify(value)}\n      ${end}`;
  return source.slice(0, startIndex) + embedded + source.slice(endIndex + end.length);
}

const withWireframePrompt = embedPrompt(ui, '/* AI_WIREFRAME_PROMPT_START */', '/* AI_WIREFRAME_PROMPT_END */', prompt);
await writeFile(uiPath, embedPrompt(withWireframePrompt, '/* AI_IMAGE_PROMPT_START */', '/* AI_IMAGE_PROMPT_END */', imagePrompt), 'utf8');
