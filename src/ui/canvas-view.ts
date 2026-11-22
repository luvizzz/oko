/**
 * ui/canvas-view.ts — exibe um ImageBuf no <canvas> da página.
 * putImageData é blit 1:1; o tamanho EXIBIDO (CSS) é calculado aqui em JS,
 * nunca por max-width/max-height em %: em altura isso não resolve (o wrap tem
 * altura auto) e a imagem transbordava o stage — alças de perspectiva e
 * seleção de crop "flutuavam" fora do canvas visível. JS mantém o canvas
 * sempre contido no stage e o #wrap colado nele, então coordenadas de
 * overlay (getBoundingClientRect) batem pixel a pixel com a imagem.
 */
import type { ImageBuf } from "../core/image";

export class CanvasView {
  private readonly ctx: CanvasRenderingContext2D;
  private last: ImageBuf | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stage: HTMLElement,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponível");
    this.ctx = ctx;
  }

  render(img: ImageBuf): void {
    this.last = img;
    if (this.canvas.width !== img.width) this.canvas.width = img.width;
    if (this.canvas.height !== img.height) this.canvas.height = img.height;
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    this.fit();
  }

  /** escala de exibição: contém a imagem no stage sem upscale além de 1:1 */
  fit(): void {
    if (!this.last) return;
    const { width: w, height: h } = this.last;
    const s = this.fitScale();
    this.canvas.style.width = `${Math.round(w * s)}px`;
    this.canvas.style.height = `${Math.round(h * s)}px`;
  }

  private fitScale(): number {
    const cs = getComputedStyle(this.stage);
    const availW = this.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = this.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (this.last && this.last.width > 0 && this.last.height > 0) {
      return Math.min(1, availW / this.last.width, availH / this.last.height);
    }
    return 1;
  }
}
