import { clone, type ImageBuf } from "./core/image";
import { CanvasView } from "./ui/canvas-view";
import { downloadBlob, bufToBlob, loadImageFile } from "./ui/io";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fileInput = $<HTMLInputElement>("file");
const btnOpen = $<HTMLButtonElement>("btn-open");
const btnExport = $<HTMLButtonElement>("btn-export");
const status = $<HTMLSpanElement>("status");
const view = new CanvasView($<HTMLCanvasElement>("canvas"));

/** imagem original (nunca mutada) — operações futuras partem dela via clone() */
let current: ImageBuf | null = null;

btnOpen.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  status.textContent = "carregando…";
  try {
    current = await loadImageFile(file);
    view.render(current);
    btnExport.disabled = false;
    status.textContent = `${file.name} — ${current.width}×${current.height}`;
  } catch (err) {
    status.textContent = `erro: ${err instanceof Error ? err.message : err}`;
  } finally {
    fileInput.value = "";
  }
});

btnExport.addEventListener("click", async () => {
  if (!current) return;
  const blob = await bufToBlob(clone(current), "image/png");
  downloadBlob(blob, "oko-export.png");
});
