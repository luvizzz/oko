import { clone, type ImageBuf } from "./core/image";
import { runPipeline } from "./core/pipeline";
import { CanvasView } from "./ui/canvas-view";
import { downloadBlob, bufToBlob, loadImageFile } from "./ui/io";
import { loadSession, saveSession, type Session } from "./ui/session";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fileInput = $<HTMLInputElement>("file");
const btnOpen = $<HTMLButtonElement>("btn-open");
const btnExport = $<HTMLButtonElement>("btn-export");
const status = $<HTMLSpanElement>("status");
const view = new CanvasView($<HTMLCanvasElement>("canvas"));

let session: Session | null = null;

/** imagem exibida = original + pipeline; operações futuras só editam session.ops */
function currentBuf(img: ImageBuf): ImageBuf {
  return runPipeline(img, session?.ops ?? []);
}

function show(img: ImageBuf, label: string): void {
  view.render(img);
  btnExport.disabled = false;
  status.textContent = label;
}

async function restore(): Promise<void> {
  const saved = await loadSession();
  if (!saved) return;
  session = saved;
  const original = await loadImageFile(new File([saved.image], saved.filename));
  show(currentBuf(clone(original)), `sessão restaurada — ${saved.filename} — ${original.width}×${original.height}`);
}

btnOpen.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  status.textContent = "carregando…";
  try {
    const original = await loadImageFile(file);
    session = { filename: file.name, savedAt: Date.now(), ops: [], image: file };
    show(currentBuf(clone(original)), `${file.name} — ${original.width}×${original.height}`);
    await saveSession(session); // persistido ANTES de qualquer edição
  } catch (err) {
    status.textContent = `erro: ${err instanceof Error ? err.message : err}`;
  } finally {
    fileInput.value = "";
  }
});

btnExport.addEventListener("click", async () => {
  const saved = session;
  if (!saved) return;
  const original = await loadImageFile(new File([saved.image], saved.filename));
  const blob = await bufToBlob(currentBuf(original), "image/png");
  downloadBlob(blob, "oko-export.png");
});

restore().catch(() => {
  status.textContent = "nenhuma imagem";
});
