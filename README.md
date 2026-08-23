# JSON To Figma

The plugin creates local Figma component instances from a JSON file. When no local component matches an item, it creates a reusable local Frame, Text, or Shape and binds it to the local design system where possible.

## Generate from a wireframe with GPT-5.6 Terra

Paste a Markdown or ASCII wireframe into **Paste wireframe**, enter an OpenAI API key, then choose **Generate & import with Terra**. The plugin exports the current file's component and token catalog automatically, sends it with the pasted wireframe and `AI_WIREFRAME_PROMPT_EN.md` (embedded into `ui.html` at build time) to `gpt-5.6-terra`, validates the returned JSON, and imports it to the canvas.

The key is used only for that request: it is not written to the Figma document or persisted by the plugin. The manifest grants network access only to the OpenAI Responses endpoint. Run `npm run build` after changing `AI_WIREFRAME_PROMPT_EN.md` so the prompt is embedded in the UI (`scripts/embed-wireframe-prompt.mjs`). `AI_WIREFRAME_PROMPT_VI.md` is a Vietnamese translation kept in sync for manual/offline use; it is not sent to the model.

## Exported catalog

Click **Export catalog** to download `figma-system-design.json` (catalog version 5). It contains:

- `components`: local Components and Component sets. Every entry with editable component properties includes Figma's `componentPropertyDefinitions`, including each variant property's `variantOptions`.
- `tokens.colors.variables`: local Color Variables, with values for every mode.
- `tokens.colors.styles`: local Color Styles and paint definitions.
- `tokens.typography`: local Text Styles with font, size, line height, letter spacing and text case.
- `tokens.spacing`: all local Number/Float Variables, with values for every mode. These are the spacing tokens.

## Export selected layer

Select exactly one layer on the canvas, then click **Export selected layer**. The downloaded `figma-selected-layer.json` includes the selected layer and every descendant as a nested tree. The format is **auto-layout-first**: each compatible layer has an `autoLayout` object containing the parent/container flow and the layer's item sizing/positioning rules before its absolute `x`/`y` fallback. It includes direction, Hug/Fill/Fixed sizing, padding, gaps, wrapping, alignment, absolute positioning, constraints, and Grid placement/settings where Figma exposes them.

The export also writes catalog-compatible references under `reuse`: Paint Style (`fillStyle`/`strokeStyle`), Color Variable (`colorVariable`), Text Style (`textStyle`), and spacing-variable bindings (`spacing`) are stored by **catalog name**, never as a file-specific ID. Instances store their component-set name and variant; `INSTANCE_SWAP` component properties are likewise written as `{ name, variant }`. On import, a matching local component is always preferred, and the expanded child tree is used only as a visual fallback when it is unavailable.

## JSON import format

The importer also accepts the complete structure produced by **Export selected layer**: the object must contain a `layer` tree, as in `figma-selected-layer.json`. It rebuilds the tree and preserves layer names, bounds, visibility, opacity, fills/strokes, effects, text content and formatting, Auto Layout container and child sizing rules. Exported instances are flattened into editable frames from their recorded descendants, so the result does not depend on matching local components or nested instance swaps in the target file. New exports also retain vector networks. Figma does not expose a factory for boolean operations, so those are restored as editable frame fallbacks containing their descendants.

```json
{
  "items": [
    { "name": "Button", "variant": "Size=Medium, State=Default", "label": "Continue", "x": 0, "y": 0 },
    { "name": "Avatar", "x": 240, "y": 0 },
    { "name": "Input", "variant": "State=Default", "label": "Email", "row": 1, "column": 0 },
    { "name": "Card", "row": 2, "column": 0 },
    { "name": "Text/Heading", "label": "Account settings", "row": 3, "column": 0 },
    { "name": "Shape/Divider", "row": 4, "column": 0 },
    { "name": "Frame/Section", "row": 5, "column": 0 }
  ]
}
```

- The JSON can be either an object with an `items` array (shown above), or an array of items directly.
- A selected-layer export is an object with a `layer` object instead; upload `figma-selected-layer.json` directly without converting it to `items`.
- Each item requires `name`. Optional `variant` selects a Component Set variant and `label` overrides its first editable text node.
- Position an item with absolute canvas offsets `x` and `y`, or with `row` and `column`. When no position is supplied, items are placed side-by-side.
- `Text/Heading`, `Shape/Divider`, and `Frame/Section` create Text, Shape, and Frame fallbacks respectively when matching local components do not exist.

Components and variants are always preferred when they exactly match the local Figma file. Other names fall back to Text when they contain text semantics (for example `Heading` or `Label`), Shape for visual semantics (for example `Divider` or `Icon`), and Frame otherwise. Color Styles take precedence when a semantic style matches; otherwise the node is bound to a local Color Variable, which keeps it mode-aware.

## Run locally

```bash
npm install
npm run build
```

In Figma Desktop, choose **Plugins → Development → Import plugin from manifest…** and select `manifest.json`.
