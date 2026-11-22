# oko

Editor de imagens SPA (browser). Todos os algoritmos de manipulação são escritos à mão —
a única área com API pronta é import/export (`src/ui/io.ts`).

Decisões e histórico: wiki BookStack, livro *Dev*, página `image-lab-registro-de-decisoes`.

## Rodando (dockerizado)

```bash
docker compose up dev        # dev server com hot reload → http://localhost:5173
docker compose --profile prod up --build   # build de produção (nginx) → http://localhost:8090
docker compose run --rm dev npm test       # testes (Vitest, core headless)
```

## Regras do código

- `src/core/` = funções puras sobre `{width, height, data: Uint8ClampedArray}` — **zero DOM**, testável em Node.
- Manipulação de imagem (resize, crop, cor, rotação, perspectiva, borda) **nunca** delega a biblioteca nem a `ctx.drawImage` com transform/smoothing. Canvas é só decode/encode/display.
