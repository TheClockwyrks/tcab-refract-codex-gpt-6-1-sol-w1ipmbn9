/* global document, PointerEvent, Buffer, console */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://localhost:5173");
await page.waitForTimeout(250);
await page.screenshot({ path: "showcase/title.png" });
const capture = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND, cellX, cellY, allowed, solved } =
    await import("/src/game.ts");
  const { CAMPAIGN } = await import("/src/boards.ts");
  const { analyze } = await import("/src/solver.ts");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100vw;height:100vh;display:block";
  document.getElementById("stage").replaceWith(canvas);
  const engine = createEngine({
    canvas,
    width: 1280,
    height: 720,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  engine.apply((s) => ({
    ...s,
    screen: "select",
    unlockedCount: 12,
    solvedBoards: Array.from({ length: 11 }, (_, i) => i),
    selectIndex: 11,
  }));
  await engine.advance(1);
  const select = canvas.toDataURL("image/png");
  engine.apply((s) =>
    engine.debug.loadBoard({ ...s, boardIndex: 10 }, CAMPAIGN[10]),
  );
  const analysis = analyze(engine.state.board);
  const find = (index, state, routes) => {
    if (index === analysis.routes.length) return solved(state) ? routes : null;
    for (const route of analysis.routes[index]) {
      const beam = state.beams[index];
      let cells = [route.cells[0]],
        valid = true;
      for (const to of route.cells.slice(1)) {
        const current = {
          ...state,
          beams: state.beams.map((b, i) => (i === index ? { ...b, cells } : b)),
        };
        if (!allowed(current, { ...beam, cells }, to)) {
          valid = false;
          break;
        }
        cells = [...cells, to];
      }
      if (!valid) continue;
      const result = find(
        index + 1,
        {
          ...state,
          beams: state.beams.map((b, i) => (i === index ? { ...b, cells } : b)),
        },
        [...routes, route],
      );
      if (result) return result;
    }
    return null;
  };
  const solution = find(0, engine.state, []);
  if (!solution) throw new Error("No showcase solution");
  engine.startRecording();
  await engine.advance(15);
  let board;
  for (const route of solution) {
    const first = route.cells[0];
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: cellX(first.col, engine.state.board.cols),
        clientY: cellY(first.row, engine.state.board.rows),
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
      }),
    );
    await engine.advance(1);
    for (const cell of route.cells.slice(1)) {
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: cellX(cell.col, engine.state.board.cols),
          clientY: cellY(cell.row, engine.state.board.rows),
          pointerId: 1,
          isPrimary: true,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
        }),
      );
      await engine.advance(6);
      if (engine.state.screen === "playing")
        board = canvas.toDataURL("image/png");
    }
    const last = route.cells[route.cells.length - 1];
    canvas.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: cellX(last.col, engine.state.board.cols),
        clientY: cellY(last.row, engine.state.board.rows),
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        button: 0,
        buttons: 0,
      }),
    );
    await engine.advance(6);
  }
  await engine.advance(30);
  if (engine.state.screen !== "solved")
    throw new Error("Showcase was not solved");
  const recording = engine.stopRecording();
  const snapshot = engine.debug.snapshot(engine.state);
  engine.destroy();
  return { select, board, recording, snapshot };
});
for (const name of ["select", "board"])
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(capture[name].split(",")[1], "base64"),
  );
await writeFile(
  "showcase/trace.json.gz",
  gzipSync(JSON.stringify(capture.recording)),
);
console.log(
  JSON.stringify({
    frames: capture.recording.frames.length,
    seconds: capture.recording.frames.length / 30,
    screen: capture.snapshot.screen,
    errors,
  }),
);
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
