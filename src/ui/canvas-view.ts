/**
 * ui/canvas-view.ts — exibe um ImageBuf no <canvas> da página.
 * putImageData é blit 1:1; o CSS cuida do ajuste à tela. Nenhum efeito do canvas é
 * manipulação de imagem (regra do projeto).
 */
import type { ImageBuf } from "../core/image";

export class CanvasView {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponível");
    this.ctx = ctx;
  }

  render(img: ImageBuf): void {
    if (this.canvas.width !== img.width) this.canvas.width = img.width;
    if (this.canvas.height !== img.height) this.canvas.height = img.height;
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  }
}
