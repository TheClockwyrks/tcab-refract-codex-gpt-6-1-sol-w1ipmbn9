import { describe, expect, test } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import {
  action,
  allowed,
  cellX,
  cellY,
  clear,
  complete,
  debug,
  game,
  initial,
  loadBoard,
  parseBoard,
  pointer,
  snapshot,
  solved,
  targets,
} from "./game";
import type { Cell, RefractState } from "./game";
import {
  ACTIONS,
  BINDINGS,
  CAMPAIGN_LENGTH,
  CHANNELS,
  CUES,
  STAGE_H,
  STAGE_W,
  TIERS,
} from "./constants";
import { CAMPAIGN } from "./boards";
import { CASCADE_BOARDS } from "./cascade-boards";
import { generate, qualifies } from "./generator";
import { analyze } from "./solver";

const down = (s: RefractState, col: number, row: number) =>
  debug.pointerDown(s, cellX(col, s.board.cols), cellY(row, s.board.rows));
const move = (s: RefractState, col: number, row: number) =>
  debug.pointerMove(s, cellX(col, s.board.cols), cellY(row, s.board.rows));
function draw(s: RefractState, cells: readonly Cell[]) {
  s = down(s, cells[0].col, cells[0].row);
  for (const c of cells.slice(1)) s = move(s, c.col, c.row);
  return debug.pointerUp(s);
}
async function setup(step = 1000 / 60) {
  const events = new EventTarget(),
    canvas = createCanvas(STAGE_W, STAGE_H);
  const registrations: string[] = [];
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game: {
      ...game,
      initialize(api) {
        return game.initialize({
          ...api,
          input: {
            ...api.input,
            register(name, binding) {
              registrations.push(name);
              api.input.register(name, binding);
            },
          },
        });
      },
    },
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  const key = (code: string, type = "keydown") =>
    events.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const point = (
    type: string,
    x: number,
    y: number,
    device = "mouse",
    primary = true,
  ) =>
    events.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        clientX: x,
        clientY: y,
        pointerId: primary ? 1 : 2,
        isPrimary: primary,
        pointerType: device,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  return { engine, events, canvas, key, point, registrations };
}

describe("state and board contracts", () => {
  test("fresh state and reset preserve only mute", () => {
    const s = initial(true);
    expect(snapshot(s)).toMatchObject({
      version: 2,
      screen: "title",
      mode: "campaign",
      board: { cols: 0, rows: 0, nodes: [] },
      solved: false,
      beams: {},
      pointer: { down: false, device: "mouse" },
    });
    expect(
      debug.reset({ ...s, simTime: 50, solvedCount: 10, tier: 3 }),
    ).toEqual(s);
  });
  test("notation, reading order and cell centers", () => {
    const s = loadBoard(initial(), ["T.S", "1.s", "T.S"]);
    expect(s.beams.map((b) => b.channel)).toEqual(["triangle", "square"]);
    expect(snapshot(s).board.nodes[0]).toMatchObject({
      col: 0,
      row: 0,
      x: 544,
      y: 296,
      charges: null,
      spent: null,
    });
    expect(snapshot(s).board.nodes[2]).toMatchObject({
      kind: "crystal",
      charges: 1,
      spent: 0,
    });
    expect(cellX(0, 7)).toBe(352);
    expect(cellY(5, 6)).toBe(632);
  });
  test.each([[], [""], ["T?T"], ["TT", "T"], ["........"], Array(7).fill("T")])(
    "invalid notation fails loudly: %j",
    (lines) => expect(() => parseBoard(lines as string[])).toThrow(),
  );
  test("poses are independent, immediate, and leave their input untouched", () => {
    const s = Object.freeze(initial());
    let next = debug.setMode(s, "cascade");
    next = debug.setTier(next, 5);
    next = debug.setSolvedCount(next, 40);
    next = debug.setMenuIndex(next, 2);
    next = debug.setScreen(next, "solved");
    expect(next).toMatchObject({
      mode: "cascade",
      tier: 5,
      solvedCount: 40,
      menuIndex: 2,
      screen: "solved",
    });
    expect(s).toEqual(initial());
    expect(debug.reconcile(next)).toEqual(next);
    expect(debug.setSolvedCount(next, 0).tier).toBe(5);
    expect(debug.setTier(next, 1).solvedCount).toBe(40);
  });
});

describe("drawing and limits", () => {
  test("release with no segment removes the starting cell", () => {
    let s = down(loadBoard(initial(), ["TtT"]), 0, 0);
    expect(s.beams[0].cells).toHaveLength(1);
    s = debug.pointerUp(s);
    expect(s.beams[0].cells).toEqual([]);
  });
  test("partial beams persist, reverse, shorten and unwind", () => {
    let s = draw(loadBoard(initial(), ["TttT"]), [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
    s = down(s, 0, 0);
    expect(s.beams[0].cells.map((c) => c.col)).toEqual([2, 1, 0]);
    s = debug.pointerUp(s);
    s = down(s, 1, 0);
    expect(s.beams[0].cells.map((c) => c.col)).toEqual([2, 1]);
    s = move(s, 2, 0);
    expect(s.beams[0].cells).toHaveLength(1);
    s = debug.pointerUp(s);
    expect(s.beams[0].cells).toEqual([]);
  });
  test("hit radius, empty cells, foreign nodes and remote nodes refuse a move", () => {
    let s = loadBoard(initial(), ["T.S", "tts", "T.S"]);
    expect(
      debug.pointerDown(s, cellX(0, 3) + 45, cellY(0, 3)).tracing,
    ).toBeNull();
    s = down(s, 0, 0);
    const b = s.beams[0];
    expect(allowed(s, b, { col: 1, row: 0 })).toBe(false);
    expect(allowed(s, b, { col: 2, row: 0 })).toBe(false);
    expect(allowed(s, b, { col: 2, row: 1 })).toBe(false);
    expect(move(s, 2, 1).beams).toEqual(s.beams);
  });
  test("a connected emitter cannot be a pass-through; coverage does not block its entry", () => {
    let s = loadBoard(initial(), ["TTt"]);
    s = draw(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(complete(s, s.beams[0])).toBe(false);
    s = down(s, 1, 0);
    expect(move(s, 2, 0).beams).toEqual(s.beams);
  });
  test("diagonal crossing and used segments are refused", () => {
    const s = loadBoard(initial(), ["T2S", "t2s", "T.S"]);
    const posed = {
      ...s,
      beams: [
        {
          channel: "triangle" as const,
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
          ],
        },
        {
          channel: "square" as const,
          cells: [
            { col: 2, row: 0 },
            { col: 1, row: 0 },
          ],
        },
      ],
    };
    expect(allowed(posed, posed.beams[1], { col: 0, row: 1 })).toBe(false);
    expect(allowed(posed, posed.beams[0], { col: 0, row: 0 })).toBe(false);
  });
  test("crystal charge is spent on entry and refunded by retraction", () => {
    let s = loadBoard(initial(), ["T1T"]);
    s = down(s, 0, 0);
    s = move(s, 1, 0);
    expect(snapshot(s).board.nodes[1].spent).toBe(1);
    expect(solved(s)).toBe(false);
    s = move(s, 0, 0);
    expect(snapshot(s).board.nodes[1].spent).toBe(0);
  });
  test("a crystal can be revisited by one channel", () => {
    let s = loadBoard(initial(), ["Ttt", "t2t", "ttT"]);
    const route = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 2, row: 1 },
      { col: 1, row: 1 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
      { col: 1, row: 2 },
      { col: 1, row: 1 },
      { col: 2, row: 2 },
    ];
    s = draw(s, route);
    expect(s.screen).toBe("solved");
    expect(
      snapshot(s).board.nodes.find((n) => n.kind === "crystal")?.spent,
    ).toBe(2);
    expect(s.beams[0].cells).toEqual(route);
  });
  test("clear is available through debug on any screen", () => {
    let s = draw(loadBoard(initial(), ["TttT"]), [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    s = { ...s, screen: "title" };
    expect(action(s, "clear")).toEqual(s);
    expect(clear(s).beams[0].cells).toEqual([]);
  });
});

describe("screens and progression", () => {
  test("campaign grid wraps and locked boards cannot be entered", () => {
    let s = action(initial(), "confirm");
    expect(s.screen).toBe("select");
    s = action(s, "left");
    expect(s.selectIndex).toBe(5);
    expect(action(s, "confirm").screen).toBe("select");
    s = action(s, "up");
    expect(s.selectIndex).toBe(23);
    s = action(s, "right");
    expect(s.selectIndex).toBe(18);
    s = action(s, "down");
    expect(s.selectIndex).toBe(0);
  });
  test("campaign solve unlocks once, returns to correct selection, and preserves cascade", () => {
    let s = action(
      action({ ...initial(), tier: 4, solvedCount: 15 }, "confirm"),
      "confirm",
    );
    const a = analyze(s.board)!;
    s = draw(s, a.routes[0][0].cells);
    expect(s).toMatchObject({
      screen: "solved",
      solvedBoards: [0],
      unlockedCount: 2,
      tier: 4,
      solvedCount: 15,
    });
    s = action(s, "back");
    expect(s).toMatchObject({ screen: "select", selectIndex: 0 });
    s = action(s, "back");
    s = action(s, "confirm");
    s = action(s, "confirm");
    s = draw(s, a.routes[0][0].cells);
    expect(s.solvedBoards).toEqual([0]);
    expect(s.unlockedCount).toBe(2);
    expect(action(s, "confirm").boardIndex).toBe(1);
    expect(action({ ...s, menuIndex: 1 }, "confirm").boardIndex).toBe(0);
    expect(action({ ...s, menuIndex: 2 }, "confirm").screen).toBe("select");
  });
  test("final campaign solve reaches complete and supports both onward choices", () => {
    let s = loadBoard(
      {
        ...initial(),
        boardIndex: 23,
        solvedBoards: Array.from({ length: 23 }, (_, i) => i),
        unlockedCount: 24,
      },
      ["TT"],
    );
    s = draw(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(s.screen).toBe("complete");
    expect(s.solvedBoards).toHaveLength(24);
    expect(action(s, "confirm").screen).toBe("select");
    expect(action({ ...s, menuIndex: 1 }, "confirm")).toMatchObject({
      screen: "title",
      menuIndex: 0,
    });
  });
  test("cascade solve advances tier exactly once and preserves campaign", () => {
    let s = loadBoard(
      {
        ...initial(),
        mode: "cascade",
        solvedCount: 4,
        unlockedCount: 8,
        boardIndex: 6,
        selectIndex: 6,
        solvedBoards: [0, 1],
      },
      ["TT"],
    );
    s = draw(s, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(s).toMatchObject({
      screen: "solved",
      solvedCount: 5,
      tier: 2,
      unlockedCount: 8,
      boardIndex: 6,
      selectIndex: 6,
      solvedBoards: [0, 1],
    });
    expect(debug.pointerUp(s).solvedCount).toBe(5);
    expect(action(s, "confirm")).toMatchObject({
      screen: "playing",
      tier: 2,
      solvedCount: 5,
    });
    expect(action({ ...s, menuIndex: 1 }, "confirm")).toMatchObject({
      screen: "playing",
      tier: 1,
      solvedCount: 0,
    });
    expect(action(s, "back")).toMatchObject({ screen: "title", menuIndex: 1 });
  });
  test("pointer menus arm on press and activate only on matching release", () => {
    let s = initial();
    const t = targets(s)[2];
    s = pointer(s, "move", t.x + 10, t.y + 10, "touch");
    expect(s.menuIndex).toBe(2);
    s = pointer(s, "down", t.x + 10, t.y + 10, "touch");
    expect(s.armedTarget).toBe("menu-2");
    s = pointer(s, "up", 0, 0, "touch");
    expect(s.screen).toBe("title");
    s = pointer(s, "down", t.x + 10, t.y + 10, "touch");
    s = debug.pointerUp(s, "touch");
    expect(s.screen).toBe("howto");
    expect(action(s, "back").menuIndex).toBe(2);
  });
  test("targets are within stage, touch sized and mutually disjoint on every screen", () => {
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const)
      for (const mode of ["campaign", "cascade"] as const) {
        const ts = targets({ ...initial(), screen, mode });
        for (const t of ts) {
          expect(t.w).toBeGreaterThanOrEqual(96);
          expect(t.h).toBeGreaterThanOrEqual(72);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.y).toBeGreaterThanOrEqual(0);
          expect(t.x + t.w).toBeLessThanOrEqual(STAGE_W);
          expect(t.y + t.h).toBeLessThanOrEqual(STAGE_H);
          for (const other of ts)
            if (other !== t)
              expect(
                t.x >= other.x + other.w ||
                  other.x >= t.x + t.w ||
                  t.y >= other.y + other.h ||
                  other.y >= t.y + t.h,
              ).toBe(true);
        }
      }
  });
});

describe("cascade certification", () => {
  test.each(TIERS)("all seeds meet tier $tier bounds", (t) => {
    const unique = [
      ...new Set(CASCADE_BOARDS[t.tier - 1].map((b) => JSON.stringify(b))),
    ].map((b) => JSON.parse(b) as string[]);
    for (const b of unique)
      expect(qualifies(b, t.tier), b.join("\n")).toBe(true);
    for (let cols = t.minCols; cols <= t.maxCols; cols++)
      for (let rows = t.minRows; rows <= t.maxRows; rows++)
        expect(
          unique.some((b) => b.length === rows && b[0].length === cols),
        ).toBe(true);
  });
  test("generated variants satisfy floors and poses leave progress untouched", () => {
    for (const t of TIERS)
      for (let i = 0; i < 3; i++) {
        const b = generate(t.tier);
        expect(qualifies(b, t.tier)).toBe(true);
        const s = debug.generateBoard(
          { ...initial(), solvedCount: 17, tier: 4 },
          t.tier,
        );
        expect(s).toMatchObject({
          screen: "playing",
          solvedCount: 17,
          tier: 4,
        });
        expect(s.beams.every((b) => b.cells.length === 0)).toBe(true);
      }
    expect(() => generate(6)).toThrow();
    expect(qualifies(["TT"], 1)).toBe(false);
    expect(qualifies(["TT"], 8)).toBe(false);
  });
  test("campaign layouts are the supplied course", () => {
    expect(CAMPAIGN).toHaveLength(CAMPAIGN_LENGTH);
    expect(CAMPAIGN[0]).toEqual([".Tt", "ttT", ".tt"]);
    expect(parseBoard(CAMPAIGN[23])).toMatchObject({ cols: 7, rows: 6 });
  });
});

describe("engine integration", () => {
  test("real frames integrate seconds on every screen, including uneven deltas", async () => {
    const { engine } = await setup(20);
    await engine.advance(50);
    expect(engine.state.simTime).toBeCloseTo(1);
    engine.setClock(new SequenceClock([10, 30, 60]));
    engine.apply((s) => debug.setScreen(s, "howto"));
    await engine.advance(30);
    expect(engine.state.simTime).toBeCloseTo(2);
    expect(engine.state.screen).toBe("howto");
    engine.destroy();
  });
  test("keyboard actions, mute, diagnostics and renderer run over the engine", async () => {
    const { engine, key } = await setup();
    key(BINDINGS.down[0]);
    await engine.advance(1);
    key(BINDINGS.down[0], "keyup");
    expect(engine.state.menuIndex).toBe(1);
    key(BINDINGS.confirm[0]);
    await engine.advance(1);
    expect(engine.state).toMatchObject({ screen: "playing", mode: "cascade" });
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    expect(engine.diagnostics().every((d) => d.error === undefined)).toBe(true);
    expect(engine.diagnostics().find((d) => d.name === "mode")?.value).toBe(
      "cascade",
    );
    for (const screen of ["howto", "select", "solved", "complete"] as const) {
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
    engine.destroy();
  });
  test("ordered pointer samples draw a whole trace in one frame and deduplicate cues", async () => {
    const { engine, point } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply((s) => debug.loadBoard(s, ["TttT"]));
    point("down", cellX(0, 4), cellY(0, 1));
    point("move", cellX(1, 4), cellY(0, 1));
    point("move", cellX(2, 4), cellY(0, 1));
    point("move", cellX(3, 4), cellY(0, 1));
    point("up", cellX(3, 4), cellY(0, 1));
    await engine.advance(1);
    expect(engine.state.screen).toBe("solved");
    expect(cues).toEqual([CUES.connect, CUES.channelComplete, CUES.solved]);
    expect(engine.state.pointer.down).toBe(false);
    engine.destroy();
  });
  test("secondary contact does nothing and touch uses identical tracing", async () => {
    const { engine, point } = await setup();
    engine.apply((s) => debug.loadBoard(s, ["TtT"]));
    point("down", cellX(0, 3), cellY(0, 1), "touch", false);
    await engine.advance(1);
    expect(engine.state.tracing).toBeNull();
    point("down", cellX(0, 3), cellY(0, 1), "touch");
    point("move", cellX(1, 3), cellY(0, 1), "touch");
    await engine.advance(1);
    expect(engine.state.beams[0].cells).toHaveLength(2);
    expect(engine.state.pointer.device).toBe("touch");
    engine.destroy();
  });
  test("clear emits only when segments exist; retract and completed cues are distinct", async () => {
    const { engine, key, point } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply((s) => debug.loadBoard(s, ["TttT"]));
    point("down", cellX(0, 4), cellY(0, 1));
    point("move", cellX(1, 4), cellY(0, 1));
    await engine.advance(1);
    point("move", cellX(0, 4), cellY(0, 1));
    await engine.advance(1);
    expect(cues).toEqual([CUES.connect, CUES.retract]);
    point("move", cellX(1, 4), cellY(0, 1));
    await engine.advance(1);
    key("KeyR");
    await engine.advance(1);
    expect(cues[cues.length - 1]).toBe(CUES.clear);
    key("KeyR", "keyup");
    key("KeyR");
    await engine.advance(1);
    expect(cues.filter((c) => c === CUES.clear)).toHaveLength(1);
    engine.destroy();
  });
  test("registrations use exactly the specified vocabulary", async () => {
    const { engine, registrations } = await setup();
    expect(registrations).toEqual([...ACTIONS]);
    for (const channel of CHANNELS)
      expect(
        engine.diagnostics().some((d) => d.name === `${channel} complete`),
      ).toBe(true);
    engine.destroy();
  });
});
