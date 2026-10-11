# Refract

A puzzle of light on a dark optical bench. Draw each beam between its two outlined emitters, thread every filled lens of the same shape, and spend every crystal charge exactly. Triangle, square, and diamond channels have distinct colors and silhouettes.

Campaign offers 24 hand-built studies with session progress and replay. Cascade generates fresh boards across five difficulty tiers and continues without an ending. There is no timer or move limit.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser, with no backend, runtime downloads, art files, or audio files.

## Production

```sh
npm run build
```

Serve the resulting `dist/` directory at the root of any static server. To check it locally, use `npm run preview`.

## Controls

- Mouse, pen, or touch: press an outlined emitter and drag through adjacent nodes. Release to keep the beam.
- Drag back along a beam to retract. Press either end to resume, or its middle to shorten it.
- Click or tap screen controls and menu items; activate by releasing on the same item.
- Arrow keys or WASD: move the menu highlight. Enter or Space: accept.
- R: clear the board. Escape: back. M: mute. Backtick: engine diagnostics.

Segments may run diagonally, but cannot cross or be reused. Foreign channel nodes block a beam. Crystals can be crossed repeatedly while charges remain; their counters read **spent / total**. A refused move leaves the beam in place.

Progress lasts for the current session. Campaign progress survives switching modes; selecting Cascade starts a new run.

## Checks and capture

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation tests run the Simple 2D engine with a native canvas and explicit clocks. Cascade uses randomized node exchanges around certified layouts; exhaustive route enumeration rejects any candidate that misses its tier's solvability or difficulty floor. Grid dimensions are sampled independently, and certified seeds bound generation time.

The `showcase/` directory contains the player description, screenshots, and a few seconds of live tracing recorded through the engine's drawing recorder. `node scripts/capture.mjs` captures these from a running development server at port 5173.
