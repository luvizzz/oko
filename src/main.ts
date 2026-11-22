import { type ImageBuf } from "./core/image";
import { PipelineCache, scaleOp, type Op } from "./core/pipeline";
import { lanczosResize } from "./core/resize";
import { History } from "./core/history";
import { CanvasView } from "./ui/canvas-view";
import { downloadBlob, bufToBlob, loadImageFile } from "./ui/io";
import { loadSession, saveSession, type Session } from "./ui/session";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $input = (id: string) => $<HTMLInputElement>(id);

const fileInput = $input("file");
const inpAngle = $input("inp-angle");
const lblAngle = $<HTMLSpanElement>("lbl-angle");
lblAngle.textContent = inpAngle.value + "°";
inpAngle.addEventListener("input", () => {
  lblAngle.textContent = inpAngle.value + "°";
});
const inpW = $input("inp-w");
const inpH = $input("inp-h");
const status = $<HTMLSpanElement>("status");
const tools = $<HTMLDivElement>("tools");
const stage = $<HTMLDivElement>("stage");
const sel = $<HTMLDivElement>("sel");
const canvas = $<HTMLCanvasElement>("canvas");
const view = new CanvasView(canvas, stage);

// girar o telefone / redimensionar a janela: recomputar encaixe e overlays
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
let original: ImageBuf | null = null; // decodificada 1x; ops rodam sobre ela a cada render
const history = new History(); // ops vivem no MESMO array da sessão (referência compartilhada)

/** Op temporária dos sliders (preview ao vivo); só vira sessão no "aplicar". */
let previewOp: Op | null = null;

/* ---- perf (M6) ----
 * fullCache: cache de prefixo do pipeline — o preview de slider custa só a op
 * do slider (o resto dos estágios já está calculado), e addOp valida de graça.
 * Proxy: enquanto o dedo está no slider, a pipeline roda sobre uma cópia
 * reduzida da original (ops reescalonadas via scaleOp) — ~3x menos pixels.
 * Ao soltar ('change'), renderiza a resolução cheia de novo. */
const fullCache = new PipelineCache();
const proxyCache = new PipelineCache();
let proxyBase: ImageBuf | null = null;
const PROXY_MAX_DIM = 900;
let livePreview = false;
// marcador de build p/ E2E: confirma que o browser roda o bundle esperado
(window as unknown as { __okoBuild: string }).__okoBuild = "perf-proxy-1";

function displayBuf(): ImageBuf | null {
  if (!original || !session) return null;
  return fullCache.run(original, previewOp ? [...history.ops, previewOp] : history.ops);
}

function previewBuf(): ImageBuf | null {
  if (!original || !session) return null;
  const f = Math.min(1, PROXY_MAX_DIM / Math.max(original.width, original.height));
  if (f >= 1) return displayBuf(); // imagem pequena: proxy não compensa
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
  // dimensões nos inputs/são SEMPRE as da resolução cheia: o proxy tem outra
  // escala e previewOps nunca mudam dimensões (resize/crop não têm preview)
  const dims = livePreview ? fullCache.run(original, history.ops) : buf;
  inpW.value = String(dims.width);
  inpH.value = String(dims.height);
  status.textContent = label ?? `${session.filename} — ${dims.width}×${dims.height} · ${history.ops.length} edição(ões)`;
  $<HTMLButtonElement>("btn-undo").disabled = !history.canUndo;
  $<HTMLButtonElement>("btn-redo").disabled = !history.canRedo;
}

/** valida a op rodando o pipeline completo ANTES de persistir (sessão nunca guarda op quebrada) */
async function addOp(op: Op): Promise<void> {
  if (!original || !session) return;
  previewOp = null;
  try {
    // validação incremental: o prefixo já está no cache; só a op nova executa
    fullCache.run(original, [...history.ops, op]);
  } catch (err) {
    status.textContent = `erro: ${err instanceof Error ? err.message : err}`;
    return;
  }
  history.push(op);
  await saveSession(session);
  render();
}

function setToolsEnabled(on: boolean): void {
  tools.classList.toggle("disabled", !on);
  $<HTMLButtonElement>("btn-export").disabled = !on;
  $<HTMLButtonElement>("btn-export-jpg").disabled = !on;
  $<HTMLButtonElement>("btn-undo").disabled = !on;
  $<HTMLButtonElement>("btn-redo").disabled = !on;
}

async function openImage(file: File): Promise<void> {
  status.textContent = "carregando…";
  try {
    original = await loadImageFile(file);
    session = { filename: file.name, savedAt: Date.now(), ops: [], image: file };
    history.load(session.ops);
    resetPreviewState();
    setToolsEnabled(true);
    render(`${file.name} — carregada`);
    await saveSession(session);
  } catch (err) {
    status.textContent = `erro: ${err instanceof Error ? err.message : err}`;
  }
}

// ---------- abrir/exportar ----------
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (file) await openImage(file);
  fileInput.value = "";
});
$<HTMLButtonElement>("btn-open").addEventListener("click", () => fileInput.click());

$<HTMLButtonElement>("btn-export").addEventListener("click", async () => {
  const buf = displayBuf();
  if (!buf) return;
  const blob = await bufToBlob(buf, "image/png");
  downloadBlob(blob, "oko-export.png");
});

$<HTMLButtonElement>("btn-export-jpg").addEventListener("click", async () => {
  const buf = displayBuf();
  if (!buf) return;
  const quality = Number($input("sl-quality").value) / 100;
  const blob = await bufToBlob(buf, "image/jpeg", quality);
  downloadBlob(blob, "oko-export.jpg");
});

// ---------- desfazer / refazer (M5) ----------
$<HTMLButtonElement>("btn-undo").addEventListener("click", async () => {
  const op = history.undo();
  if (!op || !session) return;
  previewOp = null;
  await saveSession(session);
  render(`desfeito: ${op.type}`);
});
$<HTMLButtonElement>("btn-redo").addEventListener("click", async () => {
  const op = history.redo();
  if (!op || !session) return;
  previewOp = null;
  await saveSession(session);
  render(`refeito: ${op.type}`);
});

// ---------- toolbar M2 ----------
$<HTMLButtonElement>("btn-flip-x").addEventListener("click", () => void addOp({ type: "flip", axis: "x" }));
$<HTMLButtonElement>("btn-flip-y").addEventListener("click", () => void addOp({ type: "flip", axis: "y" }));
$<HTMLButtonElement>("btn-rot-cw").addEventListener("click", () => void addOp({ type: "rotateZ", degrees: 90 }));
$<HTMLButtonElement>("btn-rot-ccw").addEventListener("click", () => void addOp({ type: "rotateZ", degrees: -90 }));
$<HTMLButtonElement>("btn-rot-free").addEventListener("click", () => {
  const deg = Number.parseFloat(inpAngle.value);
  if (Number.isFinite(deg)) void addOp({ type: "rotateZ", degrees: deg });
});
$<HTMLButtonElement>("btn-resize").addEventListener("click", () => {
  const w = Number.parseInt(inpW.value, 10);
  const h = Number.parseInt(inpH.value, 10);
  if (Number.isInteger(w) && Number.isInteger(h)) void addOp({ type: "resize", width: w, height: h });
});
$<HTMLButtonElement>("btn-reset").addEventListener("click", async () => {
  if (!session) return;
  previewOp = null;
  history.clear();
  await saveSession(session);
  exitCrop();
  render("edições descartadas");
});

// ---------- cor + borda com preview (M4) ----------
const slR = $input("sl-r");
const slG = $input("sl-g");
const slB = $input("sl-b");
const slRadius = $input("sl-radius");

let rafPending = false;
function previewRender(): void {
  if (rafPending) return; // 1 render por frame, não por evento de slider
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

/**
 * 'input' (dedo arrastando) renderiza no proxy de baixa resolução;
 * 'change' (dedo soltou) volta para a resolução cheia — o usuário sempre
 * termina o gesto vendo o resultado real.
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
for (const el of [slR, slG, slB]) bindLivePreview(el, colorPreview);

$<HTMLButtonElement>("btn-color").addEventListener("click", () => {
  const op: Op = {
    type: "colorGain",
    r: Number(slR.value) / 100,
    g: Number(slG.value) / 100,
    b: Number(slB.value) / 100,
  };
  slR.value = slG.value = slB.value = "100";
  void addOp(op);
});

const shapeBtns: Record<string, HTMLButtonElement> = {
  square: $<HTMLButtonElement>("btn-shape-square"),
  oval: $<HTMLButtonElement>("btn-shape-oval"),
  circle: $<HTMLButtonElement>("btn-shape-circle"),
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
bindLivePreview(slRadius, borderPreview);

$<HTMLButtonElement>("btn-border").addEventListener("click", () => {
  const op: Op = { type: "border", shape: shapeSel, radius: shapeSel === "square" ? radiusPx() : 0 };
  void addOp(op);
});

// ---------- desfoque / nitidez com preview (M6) ----------
const slBlur = $input("sl-blur");
const slSharp = $input("sl-sharp");

bindLivePreview(slBlur, () => {
  previewOp = { type: "blur", sigma: Number(slBlur.value) / 10 };
  previewRender();
});
$<HTMLButtonElement>("btn-blur").addEventListener("click", () => {
  void addOp({ type: "blur", sigma: Number(slBlur.value) / 10 });
});

bindLivePreview(slSharp, () => {
  previewOp = { type: "sharpen", amount: Number(slSharp.value) / 100, sigma: 1 };
  previewRender();
});
$<HTMLButtonElement>("btn-sharp").addEventListener("click", () => {
  void addOp({ type: "sharpen", amount: Number(slSharp.value) / 100, sigma: 1 });
});

// ---------- crop interativo ----------
let cropMode = false;
let dragStart: { x: number; y: number } | null = null;
let dragCur: { x: number; y: number } | null = null;
let selBox: { x0: number; y0: number; x1: number; y1: number } | null = null;

const btnCrop = $<HTMLButtonElement>("btn-crop");
const btnCropApply = $<HTMLButtonElement>("btn-crop-apply");
const btnCropCancel = $<HTMLButtonElement>("btn-crop-cancel");

function exitCrop(): void {
  cropMode = false;
  dragStart = selBox = null;
  stage.classList.remove("cropping");
  sel.style.display = "none";
  btnCrop.style.display = "";
  btnCropApply.style.display = "none";
  btnCropCancel.style.display = "none";
}

btnCrop.addEventListener("click", () => {
  cropMode = !cropMode;
  stage.classList.toggle("cropping", cropMode);
  if (cropMode) {
    btnCropApply.style.display = "";
    btnCropCancel.style.display = "";
  } else {
    exitCrop();
  }
});
btnCropCancel.addEventListener("click", exitCrop);

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
    exitCrop(); // clique sem arrasto descarta a seleção
    return;
  }
  btnCropApply.focus();
});

btnCropApply.addEventListener("click", () => {
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
});

// ---------- perspectiva interativa (M3) ----------
const KEYS = ["tl", "tr", "bl", "br"] as const;
const handlesWrap = $<HTMLDivElement>("handles");
const quadSvg = document.getElementById("quadsvg") as unknown as SVGSVGElement;
const quadPoly = quadSvg.querySelector("polygon")!;
const handleEls = Array.from(handlesWrap.querySelectorAll<HTMLElement>(".handle"));
const btnPersp = $<HTMLButtonElement>("btn-persp");
const btnPerspApply = $<HTMLButtonElement>("btn-persp-apply");
const btnPerspCancel = $<HTMLButtonElement>("btn-persp-cancel");

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
  btnPersp.style.display = "none";
  btnPerspApply.style.display = "";
  btnPerspCancel.style.display = "";
  drawQuad();
}

function exitPersp(): void {
  perspMode = false;
  quad = null;
  dragKey = null;
  handlesWrap.style.display = "none";
  quadSvg.style.display = "none";
  btnPersp.style.display = "";
  btnPerspApply.style.display = "none";
  btnPerspCancel.style.display = "none";
}

btnPersp.addEventListener("click", () => (perspMode ? exitPersp() : enterPersp()));
btnPerspCancel.addEventListener("click", exitPersp);
btnPerspApply.addEventListener("click", () => {
  if (!quad) return;
  const q = structuredClone(quad);
  exitPersp();
  void addOp({ type: "perspective", quad: q });
});

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
    // permite puxar um pouco para fora (até 25%) — o trim cuida do resto
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
    render(`sessão restaurada — ${saved.filename}`);
  })
  .catch(() => {
    status.textContent = "nenhuma imagem";
  });
