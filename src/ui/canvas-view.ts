/**
 * ui/canvas-view.ts — displays an ImageBuf on the page's <canvas>.
 * putImageData is a 1:1 blit; the DISPLAYED size (CSS) is computed here in JS,
 * never via % max-width/max-height: that doesn't work for height (the wrap has
 * auto height) and the image overflowed the stage — perspective handles and
 * the crop selection "floated" outside the visible canvas. JS keeps the canvas
 * always contained in the stage with #wrap glued to it, so overlay coordinates
 * (getBoundingClientRect) line up pixel-perfect with the image.
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
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
  }

  render(img: ImageBuf): void {
    this.last = img;
    if (this.canvas.width !== img.width) this.canvas.width = img.width;
    if (this.canvas.height !== img.height) this.canvas.height = img.height;
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    this.fit();
  }

  /** display scale: fits the image in the stage without upscaling beyond 1:1 */
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
