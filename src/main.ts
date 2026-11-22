import { type ImageBuf } from "./core/image";
import { PipelineCache, scaleOp, type Op } from "./core/pipeline";
import { lanczosResize } from "./core/resize";
import { History } from "./core/history";
import { CanvasView } from "./ui/canvas-view";
import { downloadBlob, bufToBlob, loadImageFile } from "./ui/io";
import { loadSession, saveSession, type Session } from "./ui/session";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $input = (id: string) => $<HTMLInputElement>(id);
const $btn = (id: string) => $<HTMLButtonElement>(id);

const fileInput = $input("file");
const inpAngle = $input("inp-angle");
const inpW = $input("inp-w");
const inpH = $input("inp-h");
const status = $<HTMLSpanElement>("status");
const panelsEl = $<HTMLDivElement>("panels");
const dockEl = $<HTMLElement>("dock");
const fab = $<HTMLDivElement>("fab");
const fabApply = $btn("fab-apply");
const fabCancel = $btn("fab-cancel");
const stage = $<HTMLDivElement>("stage");
const sel = $<HTMLDivElement>("sel");
const canvas = $<HTMLCanvasElement>("canvas");
const view = new CanvasView(canvas, stage);

// phone rotation / window resize: recompute fit and overlays
window.addEventListener("resize", () => {
  view.fit();
  if (cropMode && selBox) {
    const r = canvas.getBoundingClientRect();
    const s = r.width / (displayBuf()?.width ?? 1);
    sel.style.left = `${Math.min(selBox.x0, selBox.x1) * s}px`;
    sel.style.top = `${Math.min(selBox.y0, selBox.y1) * s}px`;
    sel.style.width = `${Math.abs(selBox.x1 - selBox.x0) * s}px`;
    sel.style.height = `${Math.abs(selBox.y1 - selBox.y0) * s}px`;
  }
  if (perspMode) drawQuad();
});

let session: Session | null = null;
let original: ImageBuf | null = null; // decoded once; ops run over it on every render
const history = new History(); // ops live in the SAME array as the session (shared reference)

/** Temporary op from the sliders (live preview); it only becomes session state on the FAB ✓. */
let previewOp: Op | null = null;

/* ---- perf ----
 * fullCache: pipeline prefix cache — a slider preview costs only the slider's
 * op (the rest of the stages is already computed), and addOp validates for free.
 * Proxy: while the finger is on the slider, the pipeline runs on a downscaled
 * copy of the original (ops rescaled via scaleOp) — ~3x fewer pixels.
 * On release ('change'), render full resolution again. */
const fullCache = new PipelineCache();
const proxyCache = new PipelineCache();
let proxyBase: ImageBuf | null = null;
const PROXY_MAX_DIM = 900;
let livePreview = false;
// build marker for E2E: confirms the browser runs the expected bundle
(window as unknown as { __okoBuild: string }).__okoBuild = "m7-dock-1";

function displayBuf(): ImageBuf | null {
  if (!original || !session) return null;
  return fullCache.run(original, previewOp ? [...history.ops, previewOp] : history.ops);
}

function previewBuf(): ImageBuf | null {
  if (!original || !session) return null;
  const f = Math.min(1, PROXY_MAX_DIM / Math.max(original.width, original.height));
  if (f >= 1) return displayBuf(); // small image: proxy isn't worth it
  if (!proxyBase) {
    proxyBase = lanczosResize(original, Math.round(original.width * f), Math.round(original.height * f));
  }
  const ops = (previewOp ? [...history.ops, previewOp] : history.ops).map((op) => scaleOp(op, f));
  return proxyCache.run(proxyBase, ops);
}

function resetPreviewState(): void {
  proxyBase = null;
  proxyCache.invalidate();
  livePreview = false;
}

function render(label?: string): void {
  if (!original || !session) return;
  const buf = livePreview ? previewBuf() : displayBuf();
  if (!buf) return;
  view.render(buf);
  // dimensions in the inputs are ALWAYS the full-resolution ones: the proxy
  // has a different scale, and previewOps never change dimensions (resize/crop have no preview)
  const dims = livePreview ? fullCache.run(original, history.ops) : buf;
  inpW.value = String(dims.width);
  inpH.value = String(dims.height);
  status.textContent = label ?? `${session.filename} — ${dims.width}×${dims.height} · ${history.ops.length} edit(s)`;
  $btn("btn-undo").disabled = !history.canUndo;
  $btn("btn-redo").disabled = !history.canRedo;
  updateFab();
}

/** validates the op by running the full pipeline BEFORE persisting (the session never stores a broken op) */
async function addOp(op: Op): Promise<void> {
  if (!original || !session) return;
  previewOp = null;
  try {
    // incremental validation: the prefix is already cached; only the new op runs
    fullCache.run(original, [...history.ops, op]);
  } catch (err) {
    status.textContent = `error: ${err instanceof Error ? err.message : err}`;
    return;
  }
  history.push(op);
  await saveSession(session);
  render();
}

function setToolsEnabled(on: boolean): void {
  panelsEl.classList.toggle("disabled", !on);
  dockEl.classList.toggle("disabled", !on);
  $btn("btn-export").disabled = !on;
  $btn("btn-export-jpg").disabled = !on;
  $btn("btn-undo").disabled = !on;
  $btn("btn-redo").disabled = !on;
}

async function openImage(file: File): Promise<void> {
  status.textContent = "loading…";
  try {
    original = await loadImageFile(file);
    session = { filename: file.name, savedAt: Date.now(), ops: [], image: file };
    history.load(session.ops);
    resetPreviewState();
    setPanel(null);
    setToolsEnabled(true);
    render(`${file.name} — loaded`);
    await saveSession(session);
  } catch (err) {
    status.textContent = `error: ${err instanceof Error ? err.message : err}`;
  }
}

// ---------- open/export ----------
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (file) await openImage(file);
  fileInput.value = "";
});
$btn("btn-open").addEventListener("click", () => fileInput.click());

$btn("btn-export").addEventListener("click", async () => {
  const buf = displayBuf();
  if (!buf) return;
  const blob = await bufToBlob(buf, "image/png");
  downloadBlob(blob, "oko-export.png");
});

$btn("btn-export-jpg").addEventListener("click", async () => {
  const buf = displayBuf();
  if (!buf) return;
  const quality = Number($input("sl-quality").value) / 100;
  const blob = await bufToBlob(buf, "image/jpeg", quality);
  downloadBlob(blob, "oko-export.jpg");
});

// ---------- undo / redo ----------
$btn("btn-undo").addEventListener("click", async () => {
  const op = history.undo();
  if (!op || !session) return;
  previewOp = null;
  await saveSession(session);
  render(`undone: ${op.type}`);
});
$btn("btn-redo").addEventListener("click", async () => {
  const op = history.redo();
  if (!op || !session) return;
  previewOp = null;
  await saveSession(session);
  render(`redone: ${op.type}`);
});

// ---------- 5-icon dock + contextual panels ----------
const panelEls: Record<string, HTMLElement> = {
  adjust: $("panel-adjust"),
  crop: $("panel-crop"),
  rotate: $("panel-rotate"),
  effects: $("panel-effects"),
  save: $("panel-save"),
};
const dockBtns = Array.from(dockEl.querySelectorAll<HTMLButtonElement>("button"));
let openPanel: string | null = null;

function setPanel(name: string | null): void {
  // tapping the open icon closes it; tapping another one switches
  openPanel = openPanel === name ? null : name;
  for (const [k, el] of Object.entries(panelEls)) el.classList.toggle("open", k === openPanel);
  for (const b of dockBtns) b.classList.toggle("on", b.dataset["panel"] === openPanel);
}
for (const b of dockBtns) b.addEventListener("click", () => setPanel(b.dataset["panel"] ?? null));

// ---------- FAB ✓/✕ — single apply/cancel point ----------
function updateFab(): void {
  const active = Boolean(session) && (cropMode || perspMode || previewOp !== null);
  fab.style.display = active ? "flex" : "none";
  fabApply.disabled = cropMode && !selBox; // crop still has no selection: ✓ waits
}

/** ✓ applies whatever is pending, in precedence order: crop > perspective > preview */
function applyPending(): void {
  if (cropMode) return applyCrop();
  if (perspMode) return applyPersp();
  if (!previewOp) return;
  const op = previewOp;
  if (op.type === "colorGain") resetRGB();
  if (op.type === "rotateZ") setAngle(0);
  void addOp(op);
}

/** ✕ discards the pending edit (an already-applied op is NOT undone — use ↩) */
function cancelPending(): void {
  if (cropMode) return exitCrop();
  if (perspMode) return exitPersp();
  if (!previewOp) return;
  if (previewOp.type === "colorGain") resetRGB();
  if (previewOp.type === "rotateZ") setAngle(0);
  previewOp = null;
  livePreview = false;
  render("edit cancelled");
}
fabApply.addEventListener("click", applyPending);
fabCancel.addEventListener("click", cancelPending);

// ---------- buttons that apply directly (no preview) ----------
$btn("btn-flip-x").addEventListener("click", () => void addOp({ type: "flip", axis: "x" }));
$btn("btn-flip-y").addEventListener("click", () => void addOp({ type: "flip", axis: "y" }));
$btn("btn-rot-cw").addEventListener("click", () => void addOp({ type: "rotateZ", degrees: 90 }));
$btn("btn-rot-ccw").addEventListener("click", () => void addOp({ type: "rotateZ", degrees: -90 }));
$btn("btn-resize").addEventListener("click", () => {
  const w = Number.parseInt(inpW.value, 10);
  const h = Number.parseInt(inpH.value, 10);
  if (Number.isInteger(w) && Number.isInteger(h)) void addOp({ type: "resize", width: w, height: h });
});
$btn("btn-reset").addEventListener("click", async () => {
  if (!session) return;
  previewOp = null;
  history.clear();
  await saveSession(session);
  exitCrop();
  render("edits discarded");
});

// ---------- value bubbles + filled track on sliders ----------
interface BubbleSlider extends HTMLInputElement {
  __syncBubble?: () => void;
}
function bindBubble(el: BubbleSlider, fmt: (v: number) => string): void {
  const wrap = el.closest(".sld") as HTMLElement | null;
  const bub = wrap?.querySelector<HTMLElement>(".bubble");
  const sync = () => {
    if (!wrap) return;
    const min = Number(el.min);
    const max = Number(el.max);
    const p = ((Number(el.value) - min) / (max - min)) * 100;
    wrap.style.setProperty("--fill", `${p}%`);
    if (bub) {
      // compensates half the thumb width (34px) at the ends
      bub.style.left = `calc(${p}% + ${(0.5 - p / 100) * 34}px)`;
      bub.textContent = fmt(Number(el.value));
    }
  };
  sync();
  el.addEventListener("input", () => {
    wrap?.classList.add("live");
    sync();
  });
  el.addEventListener("change", () => window.setTimeout(() => wrap?.classList.remove("live"), 400));
  el["__syncBubble"] = sync; // for programmatic resets (✓/✕)
}

// ---------- color with preview ----------
const slR = $input("sl-r");
const slG = $input("sl-g");
const slB = $input("sl-b");
const slRadius = $input("sl-radius");

let rafPending = false;
function previewRender(): void {
  if (rafPending) return; // 1 render per frame, not per slider event
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

/**
 * 'input' (finger dragging) renders on the low-resolution proxy;
 * 'change' (finger released) returns to full resolution — the user always
 * ends the gesture seeing the real result.
 */
function bindLivePreview(el: HTMLInputElement, update: () => void): void {
  el.addEventListener("input", () => {
    livePreview = true;
    update();
  });
  el.addEventListener("change", () => {
    livePreview = false;
    render();
  });
}

function colorPreview(): void {
  previewOp = {
    type: "colorGain",
    r: Number(slR.value) / 100,
    g: Number(slG.value) / 100,
    b: Number(slB.value) / 100,
  };
  previewRender();
}
for (const el of [slR, slG, slB]) {
  bindBubble(el, (v) => `${v}%`);
  bindLivePreview(el, colorPreview);
}

function resetRGB(): void {
  slR.value = slG.value = slB.value = "100";
  for (const el of [slR, slG, slB]) (el as BubbleSlider).__syncBubble?.();
  previewOp = null;
  previewRender();
}

// ---------- angle with preview (rotation follows the slider→✓ model) ----------
function setAngle(deg: number): void {
  inpAngle.value = String(deg);
  (inpAngle as BubbleSlider).__syncBubble?.();
}
bindBubble(inpAngle, (v) => `${v}°`);
bindLivePreview(inpAngle, () => {
  const deg = Number.parseFloat(inpAngle.value);
  previewOp = Number.isFinite(deg) && deg !== 0 ? { type: "rotateZ", degrees: deg } : null;
  previewRender();
});

// ---------- border with preview ----------
const shapeBtns: Record<string, HTMLButtonElement> = {
  square: $btn("btn-shape-square"),
  oval: $btn("btn-shape-oval"),
  circle: $btn("btn-shape-circle"),
};
let shapeSel: "square" | "oval" | "circle" = "square";

function radiusPx(): number {
  const buf = displayBuf();
  if (!buf) return 0;
  return (Number(slRadius.value) / 100) * (Math.min(buf.width, buf.height) / 2);
}

function borderPreview(): void {
  previewOp = { type: "border", shape: shapeSel, radius: shapeSel === "square" ? radiusPx() : 0 };
  previewRender();
}

for (const [shape, btn] of Object.entries(shapeBtns)) {
  btn.addEventListener("click", () => {
    shapeSel = shape as "square" | "oval" | "circle";
    for (const [s, b] of Object.entries(shapeBtns)) b.classList.toggle("on", s === shapeSel);
    slRadius.disabled = shapeSel !== "square";
    borderPreview();
  });
}
bindBubble(slRadius, (v) => `${v}%`);
bindLivePreview(slRadius, borderPreview);

// ---------- blur / sharpen with preview ----------
const slBlur = $input("sl-blur");
const slSharp = $input("sl-sharp");

bindBubble(slBlur, (v) => `σ ${(v / 10).toFixed(1)}`);
bindLivePreview(slBlur, () => {
  previewOp = { type: "blur", sigma: Number(slBlur.value) / 10 };
  previewRender();
});

bindBubble(slSharp, (v) => `${v}%`);
bindLivePreview(slSharp, () => {
  previewOp = { type: "sharpen", amount: Number(slSharp.value) / 100, sigma: 1 };
  previewRender();
});

// quality is not an image preview — bubble only
bindBubble($input("sl-quality") as BubbleSlider, (v) => `${v}`);

// ---------- interactive crop ----------
let cropMode = false;
let dragStart: { x: number; y: number } | null = null;
let dragCur: { x: number; y: number } | null = null;
let selBox: { x0: number; y0: number; x1: number; y1: number } | null = null;

const btnCrop = $btn("btn-crop");

function exitCrop(): void {
  cropMode = false;
  dragStart = selBox = null;
  stage.classList.remove("cropping");
  sel.style.display = "none";
  updateFab();
}

btnCrop.addEventListener("click", () => {
  cropMode = !cropMode;
  stage.classList.toggle("cropping", cropMode);
  if (!cropMode) exitCrop();
  else updateFab();
});

canvas.addEventListener("pointerdown", (e) => {
  if (!cropMode) return;
  const r = canvas.getBoundingClientRect();
  dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener("pointermove", (e) => {
  if (!cropMode || !dragStart) return;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  dragCur = { x, y };
  sel.style.display = "block";
  sel.style.left = `${Math.min(dragStart.x, x)}px`;
  sel.style.top = `${Math.min(dragStart.y, y)}px`;
  sel.style.width = `${Math.abs(x - dragStart.x)}px`;
  sel.style.height = `${Math.abs(y - dragStart.y)}px`;
});
canvas.addEventListener("pointerup", () => {
  if (!cropMode || !dragStart || !dragCur) return;
  selBox = {
    x0: Math.min(dragStart.x, dragCur.x),
    y0: Math.min(dragStart.y, dragCur.y),
    x1: Math.max(dragStart.x, dragCur.x),
    y1: Math.max(dragStart.y, dragCur.y),
  };
  const w = selBox.x1 - selBox.x0;
  const h = selBox.y1 - selBox.y0;
  if (w < 4 || h < 4) {
    selBox = null; // click without drag just clears the selection
    sel.style.display = "none";
  }
  updateFab();
});

function applyCrop(): void {
  const buf = displayBuf();
  if (!buf || !selBox) return;
  const r = canvas.getBoundingClientRect();
  const sx = buf.width / r.width;
  const sy = buf.height / r.height;
  const x = Math.max(0, Math.floor(selBox.x0 * sx));
  const y = Math.max(0, Math.floor(selBox.y0 * sy));
  const w = Math.min(buf.width - x, Math.ceil((selBox.x1 - selBox.x0) * sx));
  const h = Math.min(buf.height - y, Math.ceil((selBox.y1 - selBox.y0) * sy));
  exitCrop();
  if (w >= 1 && h >= 1) void addOp({ type: "crop", x, y, width: w, height: h });
}

// ---------- interactive perspective ----------
const KEYS = ["tl", "tr", "bl", "br"] as const;
const handlesWrap = $<HTMLDivElement>("handles");
const quadSvg = document.getElementById("quadsvg") as unknown as SVGSVGElement;
const quadPoly = quadSvg.querySelector("polygon")!;
const handleEls = Array.from(handlesWrap.querySelectorAll<HTMLElement>(".handle"));
const btnPersp = $btn("btn-persp");

let perspMode = false;
let quad: Record<(typeof KEYS)[number], [number, number]> | null = null;
let dragKey: (typeof KEYS)[number] | null = null;

function canvasScale(): number {
  const buf = displayBuf();
  if (!buf) return 1;
  return canvas.getBoundingClientRect().width / buf.width;
}

function drawQuad(): void {
  if (!quad) return;
  const s = canvasScale();
  const disp = KEYS.map((k) => [quad![k][0] * s, quad![k][1] * s] as const);
  quadPoly.setAttribute("points", disp.map((p) => p.join(",")).join(" "));
  disp.forEach(([x, y], i) => {
    const el = handleEls[i]!;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });
}

function enterPersp(): void {
  const buf = displayBuf();
  if (!buf) return;
  exitCrop();
  perspMode = true;
  quad = { tl: [0, 0], tr: [buf.width, 0], bl: [0, buf.height], br: [buf.width, buf.height] };
  handlesWrap.style.display = "block";
  quadSvg.style.display = "block";
  updateFab();
  drawQuad();
}

function exitPersp(): void {
  perspMode = false;
  quad = null;
  dragKey = null;
  handlesWrap.style.display = "none";
  quadSvg.style.display = "none";
  updateFab();
}

btnPersp.addEventListener("click", () => (perspMode ? exitPersp() : enterPersp()));

function applyPersp(): void {
  if (!quad) return;
  const q = structuredClone(quad);
  exitPersp();
  void addOp({ type: "perspective", quad: q });
}

for (const el of handleEls) {
  const key = KEYS[Number(el.dataset["i"])]!;
  el.addEventListener("pointerdown", (e) => {
    dragKey = key;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener("pointermove", (e) => {
    if (dragKey !== key || !quad) return;
    const r = canvas.getBoundingClientRect();
    const s = canvasScale();
    const buf = displayBuf();
    if (!buf) return;
    // allows dragging a bit outside (up to 25%) — the trim handles the rest
    const x = Math.max(-0.25 * buf.width, Math.min(1.25 * buf.width, (e.clientX - r.left) / s));
    const y = Math.max(-0.25 * buf.height, Math.min(1.25 * buf.height, (e.clientY - r.top) / s));
    quad[key] = [x, y];
    drawQuad();
  });
  el.addEventListener("pointerup", () => (dragKey = null));
  el.addEventListener("pointercancel", () => (dragKey = null));
}

// ---------- restore ----------
loadSession()
  .then(async (saved) => {
    if (!saved) return;
    session = saved;
    history.load(saved.ops);
    original = await loadImageFile(new File([saved.image], saved.filename));
    resetPreviewState();
    setToolsEnabled(true);
    render(`session restored — ${saved.filename}`);
  })
  .catch(() => {
    status.textContent = "no image";
  });
