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

/** Op temporária dos sliders (preview ao vivo); só vira sessão no ✓ do FAB. */
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
(window as unknown as { __okoBuild: string }).__okoBuild = "m7-dock-1";

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
  $btn("btn-undo").disabled = !history.canUndo;
  $btn("btn-redo").disabled = !history.canRedo;
  updateFab();
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
  panelsEl.classList.toggle("disabled", !on);
  dockEl.classList.toggle("disabled", !on);
  $btn("btn-export").disabled = !on;
  $btn("btn-export-jpg").disabled = !on;
  $btn("btn-undo").disabled = !on;
  $btn("btn-redo").disabled = !on;
}

async function openImage(file: File): Promise<void> {
  status.textContent = "carregando…";
  try {
    original = await loadImageFile(file);
    session = { filename: file.name, savedAt: Date.now(), ops: [], image: file };
    history.load(session.ops);
    resetPreviewState();
    setPanel(null);
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

// ---------- desfazer / refazer (M5) ----------
$btn("btn-undo").addEventListener("click", async () => {
  const op = history.undo();
  if (!op || !session) return;
  previewOp = null;
  await saveSession(session);
  render(`desfeito: ${op.type}`);
});
$btn("btn-redo").addEventListener("click", async () => {
  const op = history.redo();
  if (!op || !session) return;
  previewOp = null;
  await saveSession(session);
  render(`refeito: ${op.type}`);
});

// ---------- M7: dock de 5 ícones + painéis contextuais ----------
const panelEls: Record<string, HTMLElement> = {
  ajustar: $("panel-ajustar"),
  cortar: $("panel-cortar"),
  girar: $("panel-girar"),
  efeitos: $("panel-efeitos"),
  salvar: $("panel-salvar"),
};
const dockBtns = Array.from(dockEl.querySelectorAll<HTMLButtonElement>("button"));
let openPanel: string | null = null;

function setPanel(name: string | null): void {
  // tocar no ícone aberto fecha; tocar em outro troca
  openPanel = openPanel === name ? null : name;
  for (const [k, el] of Object.entries(panelEls)) el.classList.toggle("open", k === openPanel);
  for (const b of dockBtns) b.classList.toggle("on", b.dataset["panel"] === openPanel);
}
for (const b of dockBtns) b.addEventListener("click", () => setPanel(b.dataset["panel"] ?? null));

// ---------- M7: FAB ✓/✕ — único ponto de aplicar/cancelar ----------
function updateFab(): void {
  const active = Boolean(session) && (cropMode || perspMode || previewOp !== null);
  fab.style.display = active ? "flex" : "none";
  fabApply.disabled = cropMode && !selBox; // recorte ainda sem seleção: ✓ espera
}

/** ✓ aplica o que estiver pendente, na precedência: crop > perspectiva > preview */
function applyPending(): void {
  if (cropMode) return applyCrop();
  if (perspMode) return applyPersp();
  if (!previewOp) return;
  const op = previewOp;
  if (op.type === "colorGain") resetRGB();
  if (op.type === "rotateZ") setAngle(0);
  void addOp(op);
}

/** ✕ descarta a edição pendente (a op já aplicada NÃO é desfeita — use ↩) */
function cancelPending(): void {
  if (cropMode) return exitCrop();
  if (perspMode) return exitPersp();
  if (!previewOp) return;
  if (previewOp.type === "colorGain") resetRGB();
  if (previewOp.type === "rotateZ") setAngle(0);
  previewOp = null;
  livePreview = false;
  render("edição cancelada");
}
fabApply.addEventListener("click", applyPending);
fabCancel.addEventListener("click", cancelPending);

// ---------- botões que aplicam direto (sem preview) ----------
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
  render("edições descartadas");
});

// ---------- bolhas de valor + trilha preenchida nos sliders (M7) ----------
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
      // compensa meia-largura do thumb (34px) nas pontas
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
  el["__syncBubble"] = sync; // p/ resets programáticos (✓/✕)
}

// ---------- cor com preview (M4) ----------
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

// ---------- ângulo com preview (M7: rotação entra no modelo slider→✓) ----------
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

// ---------- borda com preview (M4) ----------
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

// ---------- desfoque / nitidez com preview (M6) ----------
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

// qualidade não é preview de imagem — só bolha
bindBubble($input("sl-quality") as BubbleSlider, (v) => `${v}`);

// ---------- crop interativo ----------
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
    selBox = null; // clique sem arrasto apenas limpa a seleção
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

// ---------- perspectiva interativa (M3) ----------
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
