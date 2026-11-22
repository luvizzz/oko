# oko

SPA image editor (browser). Every manipulation algorithm is hand-written —
the only area allowed to use ready-made APIs is import/export (`src/ui/io.ts`).

## Running (dockerized)

```bash
docker compose up dev                     # dev server with hot reload → http://localhost:5173
docker compose --profile prod up --build  # production build (nginx) → http://localhost:8090
docker compose run --rm dev npm test      # tests (Vitest, headless core)
```

## Code rules

- `src/core/` = pure functions over `{width, height, data: Uint8ClampedArray}` — **zero DOM**, testable in Node.
- Image manipulation (resize, crop, color, rotation, perspective, border) **never** delegates to a library or to `ctx.drawImage` with transform/smoothing. Canvas is only used for decode/encode/display.
