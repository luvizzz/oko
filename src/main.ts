import { type ImageBuf } from "./core/image";
import { runPipeline, type Op } from "./core/pipeline";
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
const view = new CanvasView(canvas);

let session: Session | null = null;
let original: ImageBuf | null = null; // decodificada 1x; ops rodam sobre ela a cada render

function displayBuf(): ImageBuf | null {
  return original && session ? runPipeline(original, session.ops) : null;
}

function render(label?: string): void {
  const buf = displayBuf();
  if (!buf || !session) return;
  view.render(buf);
  inpW.value = String(buf.width);
  inpH.value = String(buf.height);
  status.textContent = label ?? `${session.filename} — ${buf.width}×${buf.height} · ${session.ops.length} edição(ões)`;
}

/** valida a op rodando o pipeline completo ANTES de persistir (sessão nunca guarda op quebrada) */
async function addOp(op: Op): Promise<void> {
  if (!original || !session) return;
  try {
    runPipeline(original, [...session.ops, op]);
  } catch (err) {
    status.textContent = `erro: ${err instanceof Error ? err.message : err}`;
    return;
  }
  session.ops.push(op);
  await saveSession(session);
  render();
}

function setToolsEnabled(on: boolean): void {
  tools.classList.toggle("disabled", !on);
  $<HTMLButtonElement>("btn-export").disabled = !on;
}

async function openImage(file: File): Promise<void> {
  status.textContent = "carregando…";
  try {
    original = await loadImageFile(file);
    session = { filename: file.name, savedAt: Date.now(), ops: [], image: file };
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
  session.ops = [];
  await saveSession(session);
  exitCrop();
  render("edições descartadas");
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

// ---------- restore ----------
loadSession()
  .then(async (saved) => {
    if (!saved) return;
    session = saved;
    original = await loadImageFile(new File([saved.image], saved.filename));
    setToolsEnabled(true);
    render(`sessão restaurada — ${saved.filename}`);
  })
  .catch(() => {
    status.textContent = "nenhuma imagem";
  });
