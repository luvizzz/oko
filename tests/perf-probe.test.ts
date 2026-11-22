import { describe, it } from "vitest";
import { alloc, fill } from "../src/core/image";
import { PipelineCache, runPipeline, type Op } from "../src/core/pipeline";
import { gaussianBlur } from "../src/core/filter";
import { lanczosResize } from "../src/core/resize";

function makeImg(w: number, h: number) {
  const img = alloc(w, h);
  // pseudo-random noise-ish: blur cost doesn't depend on content, but make it non-trivial
  for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37) % 256;
  return img;
}

function time(label: string, fn: () => void): number {
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms.toFixed(1)} ms`);
  return ms;
}

describe("perf probe", () => {
  it("cost of one blur op per sigma (1600x1000 = test image)", () => {
    const img = makeImg(1600, 1000);
    for (const v of [15, 30, 50]) {
      time(`blur sigma=${v / 10} (slider=${v})`, () => gaussianBlur(img, v / 10));
    }
  });

  it("displayBuf = full pipeline rerun; simulate slider frame with N ops", () => {
    const img = makeImg(1600, 1000);
    const base: Op[] = [
      { type: "rotateZ", degrees: 30 },
      { type: "resize", width: 1400, height: 900 },
      { type: "perspective", quad: { tl: [20, 10], tr: [1390, 30], bl: [10, 880], br: [1380, 890] } },
      { type: "colorGain", r: 1.1, g: 0.9, b: 1.0 },
    ];
    for (const n of [0, 2, 4]) {
      const ops = [...base.slice(0, n), { type: "blur", sigma: 1.5 } as Op];
      time(`pipeline rerun (${n} op(s) + blur preview)`, () => runPipeline(img, ops));
    }
  });

  it("cache de prefixo: slider frame = só a op do slider", () => {
    const img = makeImg(1600, 1000);
    const base: Op[] = [
      { type: "rotateZ", degrees: 30 },
      { type: "resize", width: 1400, height: 900 },
      { type: "perspective", quad: { tl: [20, 10], tr: [1390, 30], bl: [10, 880], br: [1380, 890] } },
      { type: "colorGain", r: 1.1, g: 0.9, b: 1.0 },
    ];
    const cache = new PipelineCache();
    time("prime (pipeline cheia 4 ops)", () => cache.run(img, base));
    for (const sigma of [1.0, 1.5, 2.0]) {
      time(`slider frame com cache (blur sigma=${sigma})`, () =>
        cache.run(img, [...base, { type: "blur", sigma } as Op]),
      );
    }
  });

  it("proxy 900px: preview de blur numa 1600x1000", () => {
    const img = makeImg(1600, 1000);
    const f = 900 / 1600;
    const proxy = lanczosResize(img, Math.round(1600 * f), Math.round(1000 * f)); // custo pago 1x por imagem
    const cache = new PipelineCache();
    const ops: Op[] = [{ type: "colorGain", r: 1.1, g: 0.9, b: 1.0 }];
    cache.run(proxy, ops);
    time("proxy slider frame (colorGain+blur)", () =>
      cache.run(proxy, [...ops, { type: "blur", sigma: 1.5 * f } as Op]),
    );
  });
});
