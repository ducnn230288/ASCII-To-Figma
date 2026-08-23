type PluginMessage = { type: 'ui-ready' } | { type: 'export-catalog' } | { type: 'export-selection' } | { type: 'import-json'; data: unknown } | { type: 'generate-wireframe'; apiKey: string; wireframe: string; prompt: string } | { type: 'cancel' };
type CatalogEntry = {
  name: string;
  kind: 'COMPONENT' | 'COMPONENT_SET';
  componentPropertyDefinitions?: Record<string, unknown>;
};
type TokenEntry = { name: string; id: string; description: string; values: Record<string, unknown> };
type JsonItem = { name: string; variant?: string; label?: string; x?: number; y?: number; row?: number; column?: number };
type ImportedLayer = {
  name: string; type: string; x: number; y: number; width: number; height: number;
  visible?: boolean; locked?: boolean; opacity?: number; rotation?: number;
  fills?: Paint[]; strokes?: Paint[]; cornerRadius?: number; effects?: Effect[];
  clipsContent?: boolean; strokeWeight?: number; strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  component?: { name: string; variant?: string };
  componentProperties?: Record<string, unknown>;
  vectorNetwork?: VectorNetwork;
  reuse?: { fillStyle?: string; strokeStyle?: string; colorVariable?: string; textStyle?: string; spacing?: Record<string, string> };
  // `layout` is the legacy/container shorthand. `autoLayout` additionally
  // carries each child's sizing and positioning rules for a lossless round trip.
  layout?: Record<string, unknown>; autoLayout?: { container?: Record<string, unknown>; item?: Record<string, unknown> };
  text?: Record<string, unknown>; children: ImportedLayer[];
};
type ImportPayload = { kind: 'items'; items: JsonItem[] } | { kind: 'layer'; layer: ImportedLayer };
type FallbackKind = 'FRAME' | 'TEXT' | 'SHAPE';
type DesignResources = {
  colorStyles: readonly PaintStyle[];
  textStyles: readonly TextStyle[];
  colorVariables: readonly Variable[];
  numberVariables: readonly Variable[];
};
type CatalogReferences = {
  colorStyles: ReadonlyMap<string, string>;
  textStyles: ReadonlyMap<string, string>;
  variables: ReadonlyMap<string, string>;
};

figma.showUI(__html__, { width: 480, height: 760, themeColors: true });

function postSelectionState(): void {
  figma.ui.postMessage({ type: 'selection-state', hasSelection: figma.currentPage.selection.length > 0 });
}

figma.on('selectionchange', postSelectionState);
postSelectionState();

let documentLoaded: Promise<void> | undefined;
function ensureDocumentLoaded(): Promise<void> {
  documentLoaded ??= figma.loadAllPagesAsync();
  return documentLoaded;
}

function localComponents(): readonly (ComponentNode | ComponentSetNode)[] {
  // Pages are loaded once by ensureDocumentLoaded() before this helper is used.
  // eslint-disable-next-line @figma/figma-plugins/dynamic-page-find-method-advice
  return figma.root.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })
    // A Component Set owns its variant components. Figma Assets shows that set
    // once, rather than showing each of those implementation children again.
    .filter((node) => node.type !== 'COMPONENT' || node.parent?.type !== 'COMPONENT_SET');
}

function variantValues(node: ComponentNode): Record<string, string> {
  // Do not use `variantProperties`: Figma throws while reading it when the
  // containing component set has validation errors. Variant names retain the
  // same `Property=Value` data shown in Assets.
  return Object.fromEntries(node.name.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter((entry): entry is [string, string] => entry.length === 2 && !!entry[0]));
}

function exportComponentPropertyDefinitions(node: ComponentNode | ComponentSetNode): Record<string, unknown> | undefined {
  try {
    const definitions = node.componentPropertyDefinitions;
    return Object.keys(definitions).length ? definitions as Record<string, unknown> : undefined;
  } catch {
    // Keep exporting the catalog when Figma cannot read definitions from a malformed component set.
    return undefined;
  }
}

function exportCatalogComponent(node: ComponentNode | ComponentSetNode): CatalogEntry {
  const componentPropertyDefinitions = exportComponentPropertyDefinitions(node);
  return {
    name: node.name,
    kind: node.type,
    ...(componentPropertyDefinitions ? { componentPropertyDefinitions } : {}),
  };
}

async function exportCatalog() {
  await ensureDocumentLoaded();
  const [colorStyles, textStyles, variables, collections] = await Promise.all([
    figma.getLocalPaintStylesAsync(), figma.getLocalTextStylesAsync(),
    figma.variables.getLocalVariablesAsync(), figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const modeNames = new Map<string, string>();
  collections.forEach((collection) => collection.modes.forEach((mode) => modeNames.set(mode.modeId, `${collection.name}/${mode.name}`)));
  const variableTokens = (type: 'COLOR' | 'FLOAT'): TokenEntry[] => variables
    .filter((variable) => variable.resolvedType === type)
    .map((variable) => ({
      name: variable.name, id: variable.id, description: variable.description,
      values: Object.fromEntries(Object.entries(variable.valuesByMode).map(([modeId, value]) => [modeNames.get(modeId) ?? modeId, value])),
    })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: 5,
    components: localComponents().map(exportCatalogComponent).sort((a, b) => a.name.localeCompare(b.name)),
    tokens: {
      colors: {
        variables: variableTokens('COLOR'),
        styles: colorStyles.map((style) => ({ name: style.name, id: style.id, description: style.description, paints: style.paints })),
      },
      typography: textStyles.map((style) => ({ name: style.name, id: style.id, description: style.description, fontName: style.fontName, fontSize: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textCase: style.textCase, paragraphSpacing: style.paragraphSpacing })),
      spacing: variableTokens('FLOAT'),
    },
  };
}

async function catalogReferences(): Promise<CatalogReferences> {
  const [colorStyles, textStyles, variables] = await Promise.all([
    figma.getLocalPaintStylesAsync(), figma.getLocalTextStylesAsync(), figma.variables.getLocalVariablesAsync(),
  ]);
  return {
    colorStyles: new Map(colorStyles.map((style) => [style.id, style.name])),
    textStyles: new Map(textStyles.map((style) => [style.id, style.name])),
    variables: new Map(variables.map((variable) => [variable.id, variable.name])),
  };
}

function resourceName(references: ReadonlyMap<string, string>, id: unknown): string | undefined {
  return typeof id === 'string' ? references.get(id) : undefined;
}

function variableName(references: CatalogReferences, alias: unknown): string | undefined {
  const value = record(alias);
  return value?.type === 'VARIABLE_ALIAS' ? resourceName(references.variables, value.id) : undefined;
}

function serializeReuse(node: SceneNode, references: CatalogReferences): Record<string, unknown> | undefined {
  const source = node as unknown as Record<string, unknown>;
  const bound = record(source.boundVariables);
  const spacing: Record<string, string> = {};
  for (const key of ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
    const name = variableName(references, bound?.[key]);
    if (name) spacing[key] = name;
  }
  // A paint's bound color variable is exposed as the first fills alias.
  const fillAliases = Array.isArray(bound?.fills) ? bound.fills : [];
  const colorVariable = variableName(references, fillAliases[0]);
  const reuse = {
    fillStyle: resourceName(references.colorStyles, source.fillStyleId),
    strokeStyle: resourceName(references.colorStyles, source.strokeStyleId),
    colorVariable,
    textStyle: resourceName(references.textStyles, source.textStyleId),
    ...(Object.keys(spacing).length ? { spacing } : {}),
  };
  return Object.values(reuse).some((value) => value !== undefined) ? reuse : undefined;
}

async function componentReference(component: ComponentNode): Promise<{ name: string; variant?: string }> {
  const parent = component.parent;
  return parent?.type === 'COMPONENT_SET'
    ? { name: parent.name, variant: component.name }
    : { name: component.name };
}

async function serializeComponentProperties(node: InstanceNode): Promise<Record<string, unknown>> {
  try {
    const properties = node.componentProperties as Record<string, unknown>;
    const entries = await Promise.all(Object.entries(properties).map(async ([name, raw]) => {
      const property = record(raw);
      if (property?.type !== 'INSTANCE_SWAP' || typeof property.value !== 'string') return [name, raw] as const;
      const swapped = await figma.getNodeByIdAsync(property.value);
      if (swapped?.type !== 'COMPONENT') return [name, raw] as const;
      return [name, { ...property, value: await componentReference(swapped) }] as const;
    }));
    return Object.fromEntries(entries);
  } catch {
    return { unavailable: 'Figma could not read component properties because the component set has errors.' };
  }
}

function readProperties(node: SceneNode, properties: readonly string[]): Record<string, unknown> {
  const source = node as unknown as Record<string, unknown>;
  return Object.fromEntries(properties
    .filter((property) => property in source)
    .map((property) => [property, source[property]]));
}

function omitDefaults(values: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => {
    const defaultValue = defaults[key];
    return value !== undefined && value !== defaultValue;
  }));
}

function isDefaultConstraints(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const constraints = value as Record<string, unknown>;
  return constraints.horizontal === 'MIN' && constraints.vertical === 'MIN';
}

function serializeAutoLayout(node: SceneNode): Record<string, unknown> | undefined {
  const rawContainer = readProperties(node, [
    'layoutMode', 'primaryAxisSizingMode', 'counterAxisSizingMode',
    'primaryAxisAlignItems', 'counterAxisAlignItems', 'counterAxisAlignContent',
    'layoutWrap', 'itemSpacing', 'counterAxisSpacing', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'itemReverseZIndex', 'strokesIncludedInLayout',
    'gridRowCount', 'gridColumnCount', 'gridRowGap', 'gridColumnGap',
    'gridAutoTracks', 'gridItemsPositioning',
  ]);
  const rawItem = readProperties(node, [
    'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutAlign', 'layoutGrow',
    'layoutPositioning', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'constraints', 'gridRowAnchorIndex', 'gridColumnAnchorIndex', 'gridRowSpan',
    'gridColumnSpan', 'gridChildHorizontalAlign', 'gridChildVerticalAlign',
  ]);
  const layoutMode = rawContainer.layoutMode;
  // A non-auto-layout node has no container layout to serialize. Its item
  // rules can still be meaningful when its parent uses Auto Layout.
  const container = layoutMode === 'NONE' ? {} : omitDefaults(rawContainer, {
    primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN', counterAxisAlignContent: 'AUTO',
    layoutWrap: 'NO_WRAP', itemSpacing: 0, counterAxisSpacing: 0,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    itemReverseZIndex: false, strokesIncludedInLayout: true,
    gridRowCount: 0, gridColumnCount: 0, gridRowGap: 0, gridColumnGap: 0,
    gridAutoTracks: 'NONE', gridItemsPositioning: 'MANUAL',
  });
  const item = omitDefaults(rawItem, {
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    layoutAlign: 'INHERIT', layoutGrow: 0, layoutPositioning: 'AUTO',
    minWidth: null, maxWidth: null, minHeight: null, maxHeight: null,
    gridRowAnchorIndex: -1, gridColumnAnchorIndex: -1, gridRowSpan: 1, gridColumnSpan: 1,
    gridChildHorizontalAlign: 'AUTO', gridChildVerticalAlign: 'AUTO',
  });
  if (isDefaultConstraints(item.constraints)) {
    delete item.constraints;
  }
  // Grid track objects are live Figma API objects, so reduce them to plain JSON.
  // This also preserves fixed versus flexible tracks for downstream consumers.
  const source = node as unknown as Record<string, unknown>;
  if (layoutMode === 'GRID' && Array.isArray(source.gridRowSizes) && source.gridRowSizes.length) {
    container.gridRowSizes = source.gridRowSizes.map((track) => {
      const value = track as Record<string, unknown>;
      return { type: value.type, value: value.value };
    });
  }
  if (layoutMode === 'GRID' && Array.isArray(source.gridColumnSizes) && source.gridColumnSizes.length) {
    container.gridColumnSizes = source.gridColumnSizes.map((track) => {
      const value = track as Record<string, unknown>;
      return { type: value.type, value: value.value };
    });
  }
  if (!Object.keys(container).length && !Object.keys(item).length) return undefined;
  return {
    ...(Object.keys(container).length ? { container } : {}),
    ...(Object.keys(item).length ? { item } : {}),
  };
}

async function serializeLayer(node: SceneNode, references: CatalogReferences): Promise<Record<string, unknown>> {
  const layer: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
    ...(node.visible !== true ? { visible: node.visible } : {}),
    ...(node.locked !== false ? { locked: node.locked } : {}),
    ...(node.x !== 0 ? { x: node.x } : {}),
    ...(node.y !== 0 ? { y: node.y } : {}),
    ...(node.width !== 100 ? { width: node.width } : {}),
    ...(node.height !== 100 ? { height: node.height } : {}),
  };
  // Keep layout semantics adjacent to bounds so consumers can rebuild the tree
  // using Auto Layout before falling back to absolute x/y coordinates.
  const autoLayout = serializeAutoLayout(node);
  if (autoLayout) layer.autoLayout = autoLayout;
  if ('opacity' in node && node.opacity !== 1) layer.opacity = node.opacity;
  if ('blendMode' in node && node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') layer.blendMode = node.blendMode;
  if ('rotation' in node && node.rotation !== 0) layer.rotation = node.rotation;
  if ('fills' in node) layer.fills = node.fills;
  if ('strokes' in node && node.strokes.length) layer.strokes = node.strokes;
  if ('cornerRadius' in node && node.cornerRadius !== 0) layer.cornerRadius = node.cornerRadius;
  if ('effects' in node && node.effects.length) layer.effects = node.effects;
  if ('clipsContent' in node && node.clipsContent === false) layer.clipsContent = false;
  if ('strokeWeight' in node && node.strokes.length) layer.strokeWeight = node.strokeWeight;
  if ('strokeAlign' in node && node.strokes.length) layer.strokeAlign = node.strokeAlign;
  if (autoLayout?.container) layer.layout = autoLayout.container;
  if (node.type === 'TEXT') {
    layer.text = omitDefaults({
      characters: node.characters,
      fontSize: node.fontSize,
      fontName: node.fontName,
      textStyleId: node.textStyleId,
      textAlignHorizontal: node.textAlignHorizontal,
      textAlignVertical: node.textAlignVertical,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
      textCase: node.textCase,
      textAutoResize: node.textAutoResize,
    }, {
      textStyleId: '', textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP', textCase: 'ORIGINAL',
    });
  }
  const reuse = serializeReuse(node, references);
  if (reuse) layer.reuse = reuse;
  if (node.type === 'VECTOR') layer.vectorNetwork = node.vectorNetwork;
  if (node.type === 'INSTANCE') {
    layer.componentProperties = await serializeComponentProperties(node);
    // The layer name is often a semantic label, not the component name. Store
    // the main component explicitly so importing in the same file recreates an
    // actual instance instead of silently falling back to a plain Frame.
    const main = await node.getMainComponentAsync();
    if (main) {
      layer.component = await componentReference(main);
    }
  }
  if ('children' in node) layer.children = await Promise.all(node.children.map((child) => serializeLayer(child, references)));
  return layer;
}

async function exportSelection() {
  await ensureDocumentLoaded();
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) throw new Error('Select exactly one layer to export.');
  const root = selection[0];
  return {
    version: 3,
    format: 'figma-selected-layer',
    layoutStrategy: 'auto-layout-first',
    exportedAt: new Date().toISOString(),
    document: figma.root.name,
    page: figma.currentPage.name,
    layer: await serializeLayer(root, await catalogReferences()),
  };
}

type OpenAIResponse = {
  output_text?: unknown;
  error?: { message?: unknown };
  output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
};

function responseText(response: OpenAIResponse): string {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const text = response.output?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === 'output_text' && typeof content.text === 'string')?.text;
  if (typeof text === 'string' && text.trim()) return text;
  throw new Error('The OpenAI response did not contain JSON output.');
}

// The model replies free-form (like a manual chat answer), often wrapping the
// JSON in a ```json fenced block or prose. Pull out the JSON payload before parsing.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[{[]/);
  if (start === -1) return candidate.trim();
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);
  return end > start ? candidate.slice(start, end + 1) : candidate.slice(start).trim();
}

async function generateWireframeJson(message: Extract<PluginMessage, { type: 'generate-wireframe' }>): Promise<ImportPayload> {
  const apiKey = message.apiKey.trim();
  if (!apiKey) throw new Error('Enter an OpenAI API key.');
  if (!message.wireframe.trim()) throw new Error('Paste a wireframe before generating.');
  if (!message.prompt.trim()) throw new Error('The bundled wireframe prompt is unavailable. Run npm run build again.');

  const catalog = await exportCatalog();
  const request = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.6-terra',
      store: false,
      reasoning: { effort: 'medium' },
      instructions: message.prompt,
      input: `Return exactly one valid JSON object that can be imported by the Figma plugin.\n\nWIREFRAME (nguồn yêu cầu):\n${message.wireframe}\n\nFIGMA DESIGN SYSTEM CATALOG (nguồn dữ liệu hiện tại):\n${JSON.stringify(catalog)}`,
    }),
  });
  const response = await request.json() as OpenAIResponse;
  if (!request.ok) {
    const apiMessage = typeof response.error?.message === 'string' ? response.error.message : `HTTP ${request.status}`;
    throw new Error(`OpenAI API error: ${apiMessage}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(responseText(response)));
  } catch (error) {
    throw new Error(`The model returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseImport(parsed);
}

function parseItems(data: unknown): JsonItem[] {
  const source = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(source)) throw new Error('JSON must be an array or an object with an "items" array.');
  return source.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Item ${index + 1} is invalid.`);
    const item = value as Record<string, unknown>;
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Item ${index + 1} requires a "name".`);
    const stringValue = (key: 'variant' | 'label'): string | undefined => {
      const value = item[key];
      if (value !== undefined && typeof value !== 'string') throw new Error(`Item ${index + 1}: "${key}" must be a string.`);
      return value;
    };
    const numberValue = (key: 'x' | 'y' | 'row' | 'column'): number | undefined => {
      const value = item[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Item ${index + 1}: "${key}" must be a number.`);
      return value;
    };
    return { name: item.name.trim(), variant: stringValue('variant'), label: stringValue('label'), x: numberValue('x'), y: numberValue('y'), row: numberValue('row'), column: numberValue('column') };
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// A VARIABLE_ALIAS contains a file-specific ID. Preserve the literal paint
// value on import, but drop that binding so selected-layer JSON can also be
// imported into a different Figma file without Figma rejecting the paint.
function withoutBoundVariables<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutBoundVariables) as T;
  const source = record(value);
  if (!source) return value;
  return Object.fromEntries(Object.entries(source)
    .filter(([key]) => key !== 'boundVariables')
    .map(([key, child]) => [key, withoutBoundVariables(child)])) as T;
}

function parseLayer(value: unknown, path = 'layer'): ImportedLayer {
  const source = record(value);
  if (!source) throw new Error(`${path} must be an object.`);
  if (typeof source.name !== 'string' || !source.name.trim()) throw new Error(`${path}.name must be a non-empty string.`);
  if (typeof source.type !== 'string' || !source.type.trim()) throw new Error(`${path}.type must be a non-empty string.`);
  const childrenValue = source.children;
  if (childrenValue !== undefined && !Array.isArray(childrenValue)) throw new Error(`${path}.children must be an array.`);
  const paintArray = (key: 'fills' | 'strokes'): Paint[] | undefined => {
    const paints = source[key];
    if (paints === undefined) return undefined;
    if (!Array.isArray(paints)) throw new Error(`${path}.${key} must be an array.`);
    return paints as Paint[];
  };
  const componentSource = record(source.component);
  if (componentSource && (typeof componentSource.name !== 'string' || !componentSource.name.trim())) {
    throw new Error(`${path}.component.name must be a non-empty string.`);
  }
  const reuseSource = record(source.reuse);
  const reuseString = (key: 'fillStyle' | 'strokeStyle' | 'colorVariable' | 'textStyle'): string | undefined => {
    const value = reuseSource?.[key];
    if (value !== undefined && typeof value !== 'string') throw new Error(`${path}.reuse.${key} must be a string.`);
    return value;
  };
  const spacingSource = record(reuseSource?.spacing);
  if (spacingSource && Object.values(spacingSource).some((token) => typeof token !== 'string')) {
    throw new Error(`${path}.reuse.spacing values must be token names.`);
  }
  const autoLayoutSource = record(source.autoLayout);
  const autoLayout = autoLayoutSource ? {
    container: record(autoLayoutSource.container),
    item: record(autoLayoutSource.item),
  } : undefined;
  return {
    name: source.name.trim(), type: source.type, x: finiteNumber(source.x, 0), y: finiteNumber(source.y, 0),
    width: Math.max(1, finiteNumber(source.width, 100)), height: Math.max(1, finiteNumber(source.height, 100)),
    visible: typeof source.visible === 'boolean' ? source.visible : undefined,
    locked: typeof source.locked === 'boolean' ? source.locked : undefined,
    opacity: finiteNumber(source.opacity, 1), rotation: finiteNumber(source.rotation, 0),
    // Keep this optional: assigning a zero radius to an INSTANCE creates a local
    // override and wipes out the radius inherited from its component.
    fills: paintArray('fills'), strokes: paintArray('strokes'),
    cornerRadius: source.cornerRadius === undefined ? undefined : finiteNumber(source.cornerRadius, 0),
    effects: Array.isArray(source.effects) ? source.effects as Effect[] : undefined,
    clipsContent: typeof source.clipsContent === 'boolean' ? source.clipsContent : undefined,
    strokeWeight: source.strokeWeight === undefined ? undefined : finiteNumber(source.strokeWeight, 1),
    strokeAlign: source.strokeAlign === 'INSIDE' || source.strokeAlign === 'OUTSIDE' || source.strokeAlign === 'CENTER' ? source.strokeAlign : undefined,
    component: componentSource ? { name: componentSource.name as string, variant: typeof componentSource.variant === 'string' ? componentSource.variant : undefined } : undefined,
    componentProperties: record(source.componentProperties),
    vectorNetwork: record(source.vectorNetwork) as VectorNetwork | undefined,
    reuse: reuseSource ? {
      fillStyle: reuseString('fillStyle'), strokeStyle: reuseString('strokeStyle'), colorVariable: reuseString('colorVariable'), textStyle: reuseString('textStyle'),
      spacing: spacingSource as Record<string, string> | undefined,
    } : undefined,
    layout: record(source.layout), autoLayout, text: record(source.text),
    children: (childrenValue ?? []).map((child, index) => parseLayer(child, `${path}.children[${index}]`)),
  };
}

function parseImport(data: unknown): ImportPayload {
  const source = record(data);
  if (source?.layer !== undefined) return { kind: 'layer', layer: parseLayer(source.layer) };
  return { kind: 'items', items: parseItems(data) };
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(value: string): string[] {
  return normalized(value).split(' ').filter(Boolean);
}

function matchingResource<T extends { name: string }>(resources: readonly T[], hint: string, preferredWords: string[], allowFallback = true): T | undefined {
  const hintWords = words(hint);
  return resources.find((resource) => hintWords.some((word) => words(resource.name).includes(word)))
    ?? resources.find((resource) => preferredWords.some((word) => words(resource.name).includes(word)))
    ?? (allowFallback ? resources[0] : undefined);
}

function fallbackKindFor(item: JsonItem): FallbackKind {
  const hint = normalized(item.name);
  if (hint.startsWith('text ') || /\b(text|heading|title|label|body|caption|copy|paragraph)\b/.test(hint)) return 'TEXT';
  if (hint.startsWith('shape ') || /\b(shape|divider|line|icon|avatar|image|logo|badge|dot)\b/.test(hint)) return 'SHAPE';
  return 'FRAME';
}

async function localDesignResources(): Promise<DesignResources> {
  const [colorStyles, textStyles, variables] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  return {
    colorStyles,
    textStyles,
    colorVariables: variables.filter((variable) => variable.resolvedType === 'COLOR'),
    numberVariables: variables.filter((variable) => variable.resolvedType === 'FLOAT'),
  };
}

async function bindColor(node: GeometryMixin, resources: DesignResources, hint: string, preferredWords: string[]): Promise<void> {
  const style = matchingResource(resources.colorStyles, hint, preferredWords, false);
  if (style) {
    await node.setFillStyleIdAsync(style.id);
    return;
  }
  const variable = matchingResource(resources.colorVariables, hint, preferredWords);
  if (!variable) return;
  const paint = figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } },
    'color',
    variable,
  );
  node.fills = [paint];
}

function closestNumberVariable(resources: DesignResources, target: number): Variable | undefined {
  const valueFor = (variable: Variable): number | undefined => Object.values(variable.valuesByMode)
    .find((value): value is number => typeof value === 'number');
  return resources.numberVariables.reduce<Variable | undefined>((closest, variable) => {
    if (valueFor(variable) === undefined) return closest;
    if (!closest) return variable;
    return Math.abs((valueFor(variable) ?? Infinity) - target) < Math.abs((valueFor(closest) ?? Infinity) - target)
      ? variable : closest;
  }, undefined);
}

function bindSpacing(frame: FrameNode, resources: DesignResources) {
  const padding = closestNumberVariable(resources, 16);
  const gap = closestNumberVariable(resources, 8);
  if (padding) {
    frame.paddingTop = 16;
    frame.paddingRight = 16;
    frame.paddingBottom = 16;
    frame.paddingLeft = 16;
    frame.setBoundVariable('paddingTop', padding);
    frame.setBoundVariable('paddingRight', padding);
    frame.setBoundVariable('paddingBottom', padding);
    frame.setBoundVariable('paddingLeft', padding);
  }
  if (gap) {
    frame.itemSpacing = 8;
    frame.setBoundVariable('itemSpacing', gap);
  }
}

async function createFallback(item: JsonItem, resources: DesignResources): Promise<SceneNode> {
  const kind = fallbackKindFor(item);
  if (kind === 'TEXT') {
    const text = figma.createText();
    const style = matchingResource(resources.textStyles, item.name, ['body', 'label', 'text']);
    if (style) {
      await figma.loadFontAsync(style.fontName as FontName);
      await text.setTextStyleIdAsync(style.id);
    } else {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    }
    text.characters = item.label || item.name.replace(/^Text\s*[/:-]?\s*/i, '') || 'Text';
    await bindColor(text, resources, item.name, ['text', 'foreground', 'content']);
    text.name = item.name;
    return text;
  }
  if (kind === 'SHAPE') {
    const shape = figma.createRectangle();
    const divider = /\b(divider|line)\b/.test(normalized(item.name));
    shape.resize(divider ? 160 : 40, divider ? 1 : 40);
    shape.cornerRadius = divider ? 0 : 8;
    await bindColor(shape, resources, item.name, divider ? ['border', 'divider', 'line'] : ['icon', 'accent', 'primary']);
    shape.name = item.name;
    return shape;
  }
  const frame = figma.createFrame();
  frame.resize(240, 96);
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';
  frame.cornerRadius = 8;
  bindSpacing(frame, resources);
  await bindColor(frame, resources, item.name, ['surface', 'background', 'card', 'container']);
  frame.name = item.name;
  return frame;
}

function componentFor(name: string, variant?: string): ComponentNode | null {
  const nodes = localComponents();
  const direct = nodes.find((node) => node.type === 'COMPONENT' && node.name === name);
  if (direct?.type === 'COMPONENT') return direct;
  const set = nodes.find((node) => node.type === 'COMPONENT_SET' && node.name === name);
  if (set?.type !== 'COMPONENT_SET') return null;
  if (!variant) return set.defaultVariant ?? set.children[0] ?? null;
  const ordered = variant.split(',').map((value) => value.trim()).sort().join(', ');
  const requestedProperties = Object.fromEntries(variant.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter((entry): entry is [string, string] => entry.length === 2 && !!entry[0]));
  const variants = set.children.filter((child): child is ComponentNode => child.type === 'COMPONENT');
  const match = variants.find((child) => child.name === ordered)
    ?? variants.find((child) => child.name === variant)
    ?? (Object.keys(requestedProperties).length ? variants.find((child) => Object.entries(requestedProperties).every(([property, value]) => variantValues(child)[property] === value)) : undefined)
    ?? set.defaultVariant ?? set.children[0];
  return (match as ComponentNode | undefined) ?? null;
}

function applyLayout(frame: FrameNode, layout?: Record<string, unknown>) {
  if (!layout) return;
  // Selected-layer exports use Figma's native `layoutMode`; accept the former
  // `mode` alias as well so generated JSON remains backwards compatible.
  const mode = layout.layoutMode ?? layout.mode;
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL' || mode === 'GRID' || mode === 'NONE') frame.layoutMode = mode;
  const enumValue = (key: string) => layout[key];
  const primarySizing = enumValue('primaryAxisSizingMode');
  const counterSizing = enumValue('counterAxisSizingMode');
  const primaryAlignment = enumValue('primaryAxisAlignItems');
  const counterAlignment = enumValue('counterAxisAlignItems');
  if (primarySizing === 'FIXED' || primarySizing === 'AUTO') frame.primaryAxisSizingMode = primarySizing;
  if (counterSizing === 'FIXED' || counterSizing === 'AUTO') frame.counterAxisSizingMode = counterSizing;
  if (primaryAlignment === 'MIN' || primaryAlignment === 'MAX' || primaryAlignment === 'CENTER' || primaryAlignment === 'SPACE_BETWEEN') frame.primaryAxisAlignItems = primaryAlignment;
  if (counterAlignment === 'MIN' || counterAlignment === 'MAX' || counterAlignment === 'CENTER' || counterAlignment === 'BASELINE') frame.counterAxisAlignItems = counterAlignment;
  for (const key of ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
    const value = layout[key];
    if (typeof value === 'number' && Number.isFinite(value)) frame[key] = value;
  }
}

function applyAutoLayoutItem(node: SceneNode, item?: Record<string, unknown>) {
  if (!item) return;
  // These values apply only after the child has been appended to its parent.
  // Figma ignores or rejects them on detached nodes, which was the source of
  // the layout drift in selected-layer reimports.
  const target = node as unknown as Record<string, unknown>;
  const allowed = [
    'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutAlign', 'layoutGrow',
    'layoutPositioning', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'constraints', 'gridRowAnchorIndex', 'gridColumnAnchorIndex', 'gridRowSpan',
    'gridColumnSpan', 'gridChildHorizontalAlign', 'gridChildVerticalAlign',
  ];
  for (const key of allowed) {
    if (item[key] === undefined || !(key in target)) continue;
    try { target[key] = item[key]; } catch { /* Not applicable to this node or parent. */ }
  }
}

function namedResource<T extends { name: string }>(resources: readonly T[], name?: string): T | undefined {
  return name ? resources.find((resource) => resource.name === name) : undefined;
}

async function applyReuse(node: SceneNode, layer: ImportedLayer, resources: DesignResources): Promise<void> {
  const reuse = layer.reuse;
  if (!reuse) return;
  // Every binding below is applied independently: a resource that is deleted,
  // unpublished, or otherwise unavailable on this node must not throw and abort
  // styling for the rest of the tree (see the fallback-preservation note above).
  const fillStyle = namedResource(resources.colorStyles, reuse.fillStyle);
  if (fillStyle && 'setFillStyleIdAsync' in node) {
    try { await node.setFillStyleIdAsync(fillStyle.id); } catch { /* style unavailable on this node */ }
  }
  const strokeStyle = namedResource(resources.colorStyles, reuse.strokeStyle);
  if (strokeStyle && 'setStrokeStyleIdAsync' in node) {
    try { await node.setStrokeStyleIdAsync(strokeStyle.id); } catch { /* style unavailable on this node */ }
  }
  const variable = namedResource(resources.colorVariables, reuse.colorVariable);
  if (variable && 'fills' in node) {
    try {
      // Keep the exported literal color as the paint's fallback so the layer still
      // renders correctly if the variable binding does not resolve on this node.
      const exportedFill = Array.isArray(layer.fills) ? record(layer.fills[0]) : undefined;
      const color = record(exportedFill?.color);
      const fallback = typeof color?.r === 'number' && typeof color?.g === 'number' && typeof color?.b === 'number'
        ? { r: color.r, g: color.g, b: color.b } : { r: 0.5, g: 0.5, b: 0.5 };
      node.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: fallback }, 'color', variable)];
    } catch { /* variable unavailable on this node */ }
  }
  if (node.type === 'TEXT') {
    const textStyle = namedResource(resources.textStyles, reuse.textStyle);
    if (textStyle) {
      try { await figma.loadFontAsync(textStyle.fontName as FontName); await node.setTextStyleIdAsync(textStyle.id); } catch { /* font or style unavailable */ }
    }
  }
  if (node.type === 'FRAME' && reuse.spacing) {
    for (const key of ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const) {
      const variable = namedResource(resources.numberVariables, reuse.spacing[key]);
      if (variable) { try { node.setBoundVariable(key, variable); } catch { /* not applicable to this node */ } }
    }
  }
}

async function applyInstanceTextOverride(node: InstanceNode, text?: Record<string, unknown>): Promise<void> {
  if (typeof text?.characters !== 'string') return;
  const textNode = node.findOne((child) => child.type === 'TEXT') as TextNode | null;
  if (!textNode) return;
  try {
    if (textNode.fontName !== figma.mixed) await figma.loadFontAsync(textNode.fontName);
    textNode.characters = text.characters;
  } catch { /* font unavailable: keep the instance's original text */ }
}

async function applyInstanceProperties(node: InstanceNode, exported?: Record<string, unknown>): Promise<void> {
  if (!exported) return;
  for (const [name, raw] of Object.entries(exported)) {
    const property = record(raw);
    // Component properties are exported with metadata. Figma accepts the
    // source component ID as the string value of an INSTANCE_SWAP property.
    // This is required for compound components such as Icon Title Text.
    let value = property?.value;
    // Selected-layer export writes INSTANCE_SWAP values as a catalog-compatible
    // component reference instead of a file-specific component ID.
    if (property?.type === 'INSTANCE_SWAP') {
      const reference = record(value);
      if (typeof reference?.name === 'string') {
        const component = componentFor(reference.name, typeof reference.variant === 'string' ? reference.variant : undefined);
        value = component?.id;
      }
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      // Apply individually: an unavailable swapped icon must not prevent the
      // title and subtitle overrides on the same component from being restored.
      try { node.setProperties({ [name]: value }); } catch { /* Component changed or is unavailable in this file. */ }
    }
  }
}

// A matched local component supplies its own children, so an instance's nested
// vectors/fills/text (e.g. an icon inside a button) default to that component's
// variant instead of the exported artwork. Instance children cannot be added or
// removed, but their overridable properties can still be reapplied in place.
async function applyInstanceChildOverrides(node: SceneNode, layer: ImportedLayer): Promise<void> {
  if (node.type === 'VECTOR' && layer.vectorNetwork) {
    try {
      await node.setVectorNetworkAsync(withoutBoundVariables(layer.vectorNetwork));
      node.resize(layer.width, layer.height);
    } catch { /* keep the component's original vector */ }
  }
  try { if ('fills' in node && layer.fills) node.fills = withoutBoundVariables(layer.fills); } catch { /* keep the component's original fill */ }
  try { if ('strokes' in node && layer.strokes) node.strokes = withoutBoundVariables(layer.strokes); } catch { /* keep the component's original stroke */ }
  if (node.type === 'TEXT' && typeof layer.text?.characters === 'string') {
    try {
      if (node.fontName !== figma.mixed) await figma.loadFontAsync(node.fontName);
      node.characters = layer.text.characters as string;
    } catch { /* keep the component's original text */ }
  }
  if (!('children' in node)) return;
  const children = node.children;
  for (let index = 0; index < Math.min(children.length, layer.children.length); index += 1) {
    const child = children.find((candidate) => candidate.name === layer.children[index].name) ?? children[index];
    try { await applyInstanceChildOverrides(child, layer.children[index]); } catch { /* skip this child, keep building the rest of the tree */ }
  }
}

async function createImportedLayer(layer: ImportedLayer, resources: DesignResources): Promise<SceneNode> {
  // Prefer a matching local component even though a selected-layer export also
  // contains its expanded children. Those children are a visual fallback only
  // when the target catalog does not provide the component.
  const component = layer.type === 'INSTANCE'
    ? componentFor(layer.component?.name ?? layer.name, layer.component?.variant)
    : null;
  const flattenInstance = layer.type === 'INSTANCE' && !component && layer.children.length > 0;
  const textLayer = layer.type === 'TEXT';
  const node: SceneNode = component ? component.createInstance() : textLayer ? figma.createText()
    : layer.type === 'RECTANGLE' ? figma.createRectangle()
      : layer.type === 'ELLIPSE' ? figma.createEllipse()
        : layer.type === 'LINE' ? figma.createLine()
          : layer.type === 'VECTOR' ? figma.createVector()
            // Figma has no factory for BOOLEAN_OPERATION. Its descendants can
            // still be restored when it is represented by a Frame fallback.
            : layer.type === 'BOOLEAN_OPERATION' || flattenInstance ? figma.createFrame()
            : figma.createFrame();
  node.name = layer.name;
  node.visible = layer.visible ?? true;
  node.locked = layer.locked ?? false;
  if ('opacity' in node && layer.opacity !== undefined) node.opacity = layer.opacity;
  if ('rotation' in node && layer.rotation !== undefined) node.rotation = layer.rotation;
  if ('resize' in node) node.resize(layer.width, layer.height);
  // Instances inherit their visuals from the referenced component. Applying an
  // exported empty fills array would create a local override and hide that fill.
  // A paint/image/vector can refer to a resource unavailable in the target
  // file. Treat it as a local failure, never as a reason to abandon the whole
  // selected-layer tree.
  try { if (node.type !== 'INSTANCE' && 'fills' in node && layer.fills) node.fills = withoutBoundVariables(layer.fills); } catch { /* preserve the node */ }
  try { if ('strokes' in node && layer.strokes) node.strokes = withoutBoundVariables(layer.strokes); } catch { /* preserve the node */ }
  try { if ('cornerRadius' in node && layer.cornerRadius !== undefined) node.cornerRadius = layer.cornerRadius; } catch { /* not supported by this node */ }
  try { if ('effects' in node && layer.effects) node.effects = withoutBoundVariables(layer.effects); } catch { /* unsupported effect */ }
  try { if ('clipsContent' in node && layer.clipsContent !== undefined) node.clipsContent = layer.clipsContent; } catch { /* not supported by this node */ }
  try { if ('strokeWeight' in node && layer.strokeWeight !== undefined) node.strokeWeight = layer.strokeWeight; } catch { /* invalid for this node */ }
  try { if ('strokeAlign' in node && layer.strokeAlign) node.strokeAlign = layer.strokeAlign; } catch { /* invalid for this node */ }
  if (node.type === 'VECTOR' && layer.vectorNetwork) {
    try {
      await node.setVectorNetworkAsync(withoutBoundVariables(layer.vectorNetwork));
      node.resize(layer.width, layer.height);
    } catch { /* retain an empty vector instead of aborting sibling layers */ }
  }

  if (node.type === 'FRAME') applyLayout(node, layer.autoLayout?.container ?? layer.layout);
  if (node.type === 'TEXT') {
    const text = layer.text;
    const fontName = record(text?.fontName);
    // A new TextNode starts as Inter/Regular. Figma requires that current font to
    // be loaded before changing characters, even when an imported font is loaded.
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    let importedFontLoaded = false;
    if (typeof fontName?.family === 'string' && typeof fontName.style === 'string') {
      try { await figma.loadFontAsync({ family: fontName.family, style: fontName.style }); importedFontLoaded = true; } catch { /* use Inter when the exported font is unavailable */ }
    }
    if (typeof text?.characters === 'string') node.characters = text.characters;
    if (typeof text?.fontSize === 'number') node.fontSize = text.fontSize;
    if (importedFontLoaded && fontName && typeof fontName.family === 'string' && typeof fontName.style === 'string') node.fontName = { family: fontName.family, style: fontName.style };
    if (text?.textAlignHorizontal === 'LEFT' || text?.textAlignHorizontal === 'CENTER' || text?.textAlignHorizontal === 'RIGHT' || text?.textAlignHorizontal === 'JUSTIFIED') node.textAlignHorizontal = text.textAlignHorizontal;
    if (text?.textAlignVertical === 'TOP' || text?.textAlignVertical === 'CENTER' || text?.textAlignVertical === 'BOTTOM') node.textAlignVertical = text.textAlignVertical;
    if (text?.lineHeight && typeof text.lineHeight === 'object') node.lineHeight = text.lineHeight as LineHeight;
    if (text?.letterSpacing && typeof text.letterSpacing === 'object') node.letterSpacing = text.letterSpacing as LetterSpacing;
    if (typeof text?.textCase === 'string') node.textCase = text.textCase as TextCase;
    if (text?.textAutoResize === 'NONE' || text?.textAutoResize === 'WIDTH_AND_HEIGHT' || text?.textAutoResize === 'HEIGHT' || text?.textAutoResize === 'TRUNCATE') node.textAutoResize = text.textAutoResize;
    // Setting characters can change an auto-sized text node, so restore exported bounds last.
    node.resize(layer.width, layer.height);
  }
  await applyReuse(node, layer, resources);
  if (node.type === 'INSTANCE') {
    await applyInstanceProperties(node, layer.componentProperties);
    await applyInstanceTextOverride(node, layer.text);
    for (let index = 0; index < Math.min(node.children.length, layer.children.length); index += 1) {
      const child = node.children.find((candidate) => candidate.name === layer.children[index].name) ?? node.children[index];
      try { await applyInstanceChildOverrides(child, layer.children[index]); } catch { /* skip this child, keep building the rest of the tree */ }
    }
  }
  if (node.type === 'FRAME') {
    for (const child of layer.children) {
      // One child that fails to build (e.g. an unavailable font or resource)
      // must not abandon its siblings under the same parent.
      try {
        const childNode = await createImportedLayer(child, resources);
        node.appendChild(childNode);
        childNode.x = child.x;
        childNode.y = child.y;
        applyAutoLayoutItem(childNode, child.autoLayout?.item);
      } catch { /* skip this child, keep building the rest of the tree */ }
    }
  }
  return node;
}

async function importJson(data: unknown) {
  await ensureDocumentLoaded();
  const payload = parseImport(data);
  const origin = figma.viewport.center;
  if (payload.kind === 'layer') {
    const root = await createImportedLayer(payload.layer, await localDesignResources());
    figma.currentPage.appendChild(root);
    root.x = origin.x + payload.layer.x;
    root.y = origin.y + payload.layer.y;
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    return;
  }
  const { items } = payload;
  if (!items.length) throw new Error('JSON file contains no items to import.');
  const created: SceneNode[] = [];
  const resources = await localDesignResources();
  let fallbacks = 0;
  for (const [index, item] of items.entries()) {
    const component = componentFor(item.name, item.variant);
    const node = component ? component.createInstance() : await createFallback(item, resources);
    if (component && item.label) {
      const text = (node as InstanceNode).findOne((child) => child.type === 'TEXT') as TextNode | null;
      if (text) { try { text.characters = item.label; } catch { /* protected component text */ } }
    }
    if (!component) fallbacks += 1;
    node.x = origin.x + (item.x ?? (item.column ?? index) * 256);
    node.y = origin.y + (item.y ?? (item.row ?? 0) * 112);
    figma.currentPage.appendChild(node);
    created.push(node);
  }
  if (created.length) {
    const section = figma.createSection();
    section.name = 'JSON Import';
    created.forEach((node) => section.appendChild(node));
    figma.currentPage.selection = [section];
    figma.viewport.scrollAndZoomIntoView([section]);
  }
  if (fallbacks) figma.notify(`Created ${fallbacks} fallback Frame/Text/Shape nodes from local styles and variables.`, { timeout: 5000 });
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    if (msg.type === 'ui-ready') return postSelectionState();
    if (msg.type === 'cancel') return figma.closePlugin();
    if (msg.type === 'export-catalog') return figma.ui.postMessage({ type: 'catalog-exported', catalog: await exportCatalog() });
    if (msg.type === 'export-selection') return figma.ui.postMessage({ type: 'selection-exported', selection: await exportSelection() });
    if (msg.type === 'generate-wireframe') {
      const data = await generateWireframeJson(msg);
      return figma.ui.postMessage({ type: 'wireframe-generated', data });
    }
    if (msg.type === 'import-json') { await importJson(msg.data); figma.ui.postMessage({ type: 'import-complete' }); }
  } catch (error) { figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
