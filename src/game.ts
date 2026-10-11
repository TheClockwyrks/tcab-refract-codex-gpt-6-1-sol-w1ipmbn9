import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { render } from "./render";
import { generate } from "./generator";
import { CAMPAIGN } from "./boards";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

export const BACKGROUND = "#080f19";
export type ReadState = DeepReadonly<RefractState>;
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface RefractDebugApi {
  readonly version: number;
  reset(s: ReadState): RefractState;
  snapshot(s: ReadState): Snapshot;
  reconcile(s: ReadState): RefractState;
  setMode(s: ReadState, mode: Mode): RefractState;
  setScreen(s: ReadState, screen: Screen): RefractState;
  setMenuIndex(s: ReadState, index: number): RefractState;
  setSolvedCount(s: ReadState, count: number): RefractState;
  setTier(s: ReadState, tier: number): RefractState;
  generateBoard(s: ReadState, tier: number): RefractState;
  loadBoard(s: ReadState, board: readonly string[]): RefractState;
  pointerDown(
    s: ReadState,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    s: ReadState,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(s: ReadState, device?: PointerDevice): RefractState;
  clear(s: ReadState): RefractState;
}
export const cellX = (col: number, cols: number) =>
  C.BOARD_CX - ((cols - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number, rows: number) =>
  C.BOARD_CY - ((rows - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const same = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
export function parseBoard(lines: readonly string[]): BoardState {
  const cols = lines[0]?.length ?? 0;
  if (
    !cols ||
    cols > C.GRID_MAX_COLS ||
    !lines.length ||
    lines.length > C.GRID_MAX_ROWS ||
    lines.some((l) => l.length !== cols)
  )
    throw new Error("Invalid board dimensions");
  const nodes: NodeState[] = [];
  lines.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === ".") return;
      if (/^[123]$/.test(ch)) {
        nodes.push({
          col,
          row,
          kind: "crystal",
          channel: null,
          charges: Number(ch),
        });
        return;
      }
      const i = "tsd".indexOf(ch.toLowerCase());
      if (i < 0) throw new Error(`Invalid board notation: ${ch}`);
      nodes.push({
        col,
        row,
        kind: ch === ch.toUpperCase() ? "emitter" : "lens",
        channel: C.CHANNELS[i],
        charges: null,
      });
    }),
  );
  return { cols, rows: lines.length, nodes };
}
export function initial(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: { cols: 0, rows: 0, nodes: [] },
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}
export function loadBoard(
  s: ReadState,
  lines: readonly string[],
): RefractState {
  const board = parseBoard(lines);
  return {
    ...s,
    board,
    screen: "playing",
    menuIndex: 0,
    tracing: null,
    armedTarget: null,
    beams: C.CHANNELS.filter((ch) =>
      board.nodes.some((n) => n.channel === ch),
    ).map((channel) => ({ channel, cells: [] })),
  };
}
export function spent(s: Pick<ReadState, "beams">, cell: Cell): number {
  return s.beams.reduce(
    (n, b) => n + b.cells.filter((c) => same(c, cell)).length,
    0,
  );
}
export function complete(s: Pick<ReadState, "board">, b: BeamState): boolean {
  if (b.cells.length < 2) return false;
  const ends = [b.cells[0], b.cells[b.cells.length - 1]];
  const emitters = s.board.nodes.filter(
    (n) => n.channel === b.channel && n.kind === "emitter",
  );
  return (
    emitters.length === 2 &&
    emitters.every((n) => ends.some((c) => same(c, n))) &&
    s.board.nodes
      .filter((n) => n.channel === b.channel && n.kind === "lens")
      .every(
        (n) =>
          b.cells.filter((c) => same(c, n)).length === 1 &&
          !ends.some((c) => same(c, n)),
      )
  );
}
export function solved(s: Pick<ReadState, "board" | "beams">): boolean {
  return (
    s.beams.length > 0 &&
    s.beams.every((b) => complete(s, b)) &&
    s.board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(s, n) === n.charges &&
          s.beams.every(
            (b) =>
              !b.cells.length ||
              (!same(b.cells[0], n) && !same(b.cells[b.cells.length - 1], n)),
          ),
      )
  );
}
export function allowed(
  s: Pick<ReadState, "board" | "beams">,
  b: BeamState,
  to: Cell,
): boolean {
  const from = b.cells[b.cells.length - 1];
  const node = s.board.nodes.find((n) => same(n, to));
  if (
    !from ||
    !node ||
    same(from, to) ||
    Math.abs(from.col - to.col) > 1 ||
    Math.abs(from.row - to.row) > 1 ||
    (node.channel !== null && node.channel !== b.channel)
  )
    return false;
  const lastNode = s.board.nodes.find((n) => same(n, from));
  if (lastNode?.kind === "emitter" && b.cells.length > 1) return false;
  if (node.kind !== "crystal" && b.cells.some((c) => same(c, to))) return false;
  if (node.kind === "crystal" && spent(s, to) >= (node.charges ?? 0))
    return false;
  for (const beam of s.beams)
    for (let i = 1; i < beam.cells.length; i++) {
      const a = beam.cells[i - 1],
        z = beam.cells[i];
      if ((same(a, from) && same(z, to)) || (same(z, from) && same(a, to)))
        return false;
      if (
        from.col !== to.col &&
        from.row !== to.row &&
        a.col !== z.col &&
        a.row !== z.row &&
        a.col + z.col === from.col + to.col &&
        a.row + z.row === from.row + to.row
      )
        return false;
    }
  return true;
}
function finish(s: ReadState): RefractState {
  if (s.screen !== "playing" || !solved(s)) return s;
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return {
      ...s,
      screen: "solved",
      tracing: null,
      armedTarget: null,
      menuIndex: 0,
      solvedCount,
      tier: Math.min(Math.floor(solvedCount / C.TIER_ADVANCE) + 1, C.MAX_TIER),
    };
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return {
    ...s,
    screen: solvedBoards.length === C.CAMPAIGN_LENGTH ? "complete" : "solved",
    tracing: null,
    armedTarget: null,
    menuIndex: 0,
    solvedBoards,
    unlockedCount: Math.max(
      s.unlockedCount,
      Math.min(s.boardIndex + 2, C.CAMPAIGN_LENGTH),
    ),
    selectIndex: s.boardIndex,
  };
}
export function clear(s: ReadState): RefractState {
  return {
    ...s,
    beams: s.beams.map((b) => ({ ...b, cells: [] })),
    tracing: null,
  };
}
export function menuItems(s: ReadState): readonly string[] {
  if (s.screen === "title") return C.TITLE_ITEMS;
  if (s.screen === "complete") return ["BOARD SELECT", "MAIN MENU"];
  if (s.screen === "solved")
    return s.mode === "cascade"
      ? C.SOLVED_ITEMS
      : [
          ...(s.boardIndex < C.CAMPAIGN_LENGTH - 1 ? ["NEXT BOARD"] : []),
          "REPLAY",
          "BOARD SELECT",
        ];
  return [];
}
export function targets(s: ReadState): Target[] {
  const box = (
    id: string,
    x: number,
    y: number,
    w = C.TARGET_MIN_W,
    h = C.TARGET_MIN_H,
  ): Target => ({ id, x, y, w, h });
  if (s.screen === "playing")
    return [box("clear", 1064, 550, 144), box("back", 72, 550, 144)];
  if (s.screen === "howto") return [box("back", 72, 610, 144)];
  if (s.screen === "select")
    return [
      ...Array.from({ length: C.CAMPAIGN_LENGTH }, (_, i) =>
        box(
          `board-${i + 1}`,
          290 + (i % 6) * 116,
          226 + Math.floor(i / 6) * 91,
          100,
          76,
        ),
      ),
      box("back", 72, 610, 144),
    ];
  return menuItems(s).map((_, i) =>
    box(
      `menu-${i}`,
      s.screen === "title" ? 100 : 64,
      s.screen === "title" ? 372 + i * 88 : 350 + i * 88,
      s.screen === "title" ? 390 : 244,
      76,
    ),
  );
}
function screen(s: ReadState, screen: Screen, menuIndex = 0): RefractState {
  return { ...s, screen, menuIndex, armedTarget: null, tracing: null };
}
function enterCampaign(s: ReadState, index: number): RefractState {
  return loadBoard(
    { ...s, boardIndex: index, selectIndex: index },
    CAMPAIGN[index],
  );
}
function select(s: ReadState): RefractState {
  return { ...screen(clear(s), "select"), selectIndex: s.boardIndex };
}
export function action(s: ReadState, name: string): RefractState {
  if (name === "clear") return s.screen === "playing" ? clear(s) : s;
  if (name === "back") {
    if (s.screen === "title") return s;
    if (s.screen === "howto") return screen(s, "title", 2);
    if (s.screen === "select") return screen(s, "title", 0);
    return s.mode === "cascade" ? screen(s, "title", 1) : select(s);
  }
  if (s.screen === "select") {
    const col = s.selectIndex % 6,
      row = Math.floor(s.selectIndex / 6);
    if (name === "left" || name === "right")
      return {
        ...s,
        selectIndex: row * 6 + ((col + (name === "left" ? 5 : 1)) % 6),
      };
    if (name === "up" || name === "down")
      return {
        ...s,
        selectIndex: ((row + (name === "up" ? 3 : 1)) % 4) * 6 + col,
      };
    if (name === "confirm" && s.selectIndex < s.unlockedCount)
      return enterCampaign(s, s.selectIndex);
    return s;
  }
  const items = menuItems(s);
  if (!items.length) return s;
  if (name === "up" || name === "down")
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "up" ? items.length - 1 : 1)) % items.length,
    };
  if (name !== "confirm") return s;
  if (s.screen === "title") {
    if (s.menuIndex === 0) return select({ ...s, mode: "campaign" });
    if (s.menuIndex === 1)
      return loadBoard(
        { ...s, mode: "cascade", solvedCount: 0, tier: 1 },
        generate(1),
      );
    return screen(s, "howto");
  }
  if (s.screen === "complete")
    return s.menuIndex === 0 ? select(s) : screen(s, "title", 0);
  if (s.mode === "cascade")
    return loadBoard(
      s.menuIndex === 1 ? { ...s, solvedCount: 0, tier: 1 } : s,
      generate(s.menuIndex === 1 ? 1 : s.tier),
    );
  if (s.boardIndex < C.CAMPAIGN_LENGTH - 1 && s.menuIndex === 0)
    return enterCampaign(s, s.boardIndex + 1);
  return s.menuIndex === items.length - 1
    ? select(s)
    : enterCampaign(s, s.boardIndex);
}
export function pointer(
  s: ReadState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): RefractState {
  let next: RefractState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const hit = targets(next).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if ((type === "down" || !s.pointer.down) && hit) {
    if (hit.id.startsWith("menu-"))
      next = { ...next, menuIndex: Number(hit.id.slice(5)) };
    if (hit.id.startsWith("board-"))
      next = { ...next, selectIndex: Number(hit.id.slice(6)) - 1 };
  }
  if (type === "up") {
    next = {
      ...next,
      armedTarget: null,
      tracing: null,
      beams: next.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    if (hit && hit.id === s.armedTarget)
      return action(
        next,
        hit.id === "clear" || hit.id === "back" ? hit.id : "confirm",
      );
    return next;
  }
  if (type === "down") next = { ...next, armedTarget: hit?.id ?? null };
  if (next.screen !== "playing" || (hit && type === "down") || next.armedTarget)
    return next;
  const node = next.board.nodes.find(
    (n) =>
      Math.hypot(
        cellX(n.col, next.board.cols) - x,
        cellY(n.row, next.board.rows) - y,
      ) <= C.NODE_HIT_R,
  );
  if (!node) return next;
  if (type === "down") {
    let b = next.beams.find(
      (b) =>
        node.kind === "emitter" &&
        b.channel === node.channel &&
        b.cells.length < 2,
    );
    let cells: readonly Cell[] = [];
    if (b) cells = [{ col: node.col, row: node.row }];
    else {
      b = next.beams.find(
        (b) =>
          b.cells.length > 0 &&
          (same(b.cells[0], node) || same(b.cells[b.cells.length - 1], node)),
      );
      if (b) cells = same(b.cells[0], node) ? [...b.cells].reverse() : b.cells;
      else {
        const passing = next.beams.filter((b) =>
          b.cells.some((c) => same(c, node)),
        );
        if (passing.length === 1) {
          b = passing[0];
          const last = b.cells.map((c) => same(c, node)).lastIndexOf(true);
          cells = b.cells.slice(0, last + 1);
        }
      }
    }
    if (b)
      next = {
        ...next,
        tracing: { channel: b.channel },
        beams: next.beams.map((beam) =>
          beam.channel === b.channel ? { ...beam, cells } : beam,
        ),
      };
  } else if (next.pointer.down && next.tracing) {
    const b = next.beams.find((b) => b.channel === next.tracing?.channel)!;
    let cells = b.cells;
    if (cells.length > 1 && same(cells[cells.length - 2], node))
      cells = cells.slice(0, -1);
    else if (allowed(next, b, node))
      cells = [...cells, { col: node.col, row: node.row }];
    next = {
      ...next,
      beams: next.beams.map((beam) =>
        beam.channel === b.channel ? { ...beam, cells } : beam,
      ),
    };
  }
  return finish(next);
}
export function snapshot(s: ReadState) {
  return {
    version: C.REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      ...s.board,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        { cells: b.cells.map((c) => ({ ...c })), complete: complete(s, b) },
      ]),
    ),
    solved: solved(s),
    tracing: s.tracing
      ? {
          channel: s.tracing.channel,
          live: {
            ...s.beams
              .find((b) => b.channel === s.tracing?.channel)!
              .cells.slice(-1)[0],
          },
        }
      : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
export const debug: RefractDebugApi = {
  version: C.REFRACT_DEBUG_VERSION,
  reset: (s) => initial(s.muted),
  snapshot,
  reconcile: (s) => ({ ...s }),
  setMode: (s, mode) => ({ ...s, mode }),
  setScreen: (s, screen) => ({ ...s, screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
  setSolvedCount: (s, solvedCount) => ({ ...s, solvedCount }),
  setTier: (s, tier) => ({ ...s, tier }),
  generateBoard: (s, tier) => loadBoard(s, generate(tier)),
  loadBoard,
  pointerDown: (s, x, y, d) => pointer(s, "down", x, y, d),
  pointerMove: (s, x, y, d) => pointer(s, "move", x, y, d),
  pointerUp: (s, d) => pointer(s, "up", s.pointer.x, s.pointer.y, d),
  clear,
};
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    for (const a of C.ACTIONS)
      api.input.register(a, { keys: [...C.BINDINGS[a]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 1 ? "triangle" : "sine",
        freq: [440, 330, 660, 880, 220][i],
        freqTo: [620, 180, 990, 1320, 110][i],
        durationMs: [70, 70, 160, 300, 120][i],
        gain: 0.08,
      }),
    );
    for (const name of [
      "screen",
      "mode",
      "cols",
      "rows",
      "solved",
      "pointer",
      "device",
    ])
      api.diagnostics.register(name, (s) =>
        name === "cols"
          ? s.board.cols
          : name === "rows"
            ? s.board.rows
            : name === "solved"
              ? solved(s)
              : name === "pointer"
                ? `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)}`
                : name === "device"
                  ? s.pointer.device
                  : name === "screen"
                    ? s.screen
                    : s.mode,
      );
    for (const channel of C.CHANNELS) {
      api.diagnostics.register(
        `${channel} length`,
        (s) => s.beams.find((b) => b.channel === channel)?.cells.length ?? 0,
      );
      api.diagnostics.register(`${channel} complete`, (s) => {
        const b = s.beams.find((b) => b.channel === channel);
        return b ? complete(s, b) : false;
      });
    }
    for (let i = 0; i < C.GRID_MAX_COLS * C.GRID_MAX_ROWS; i++)
      api.diagnostics.register(`crystal ${i + 1}`, (s) => {
        const n = s.board.nodes.filter((n) => n.kind === "crystal")[i];
        return n ? `${spent(s, n)}/${n.charges}` : "-";
      });
    return [initial(), debug];
  },
  update(s, api, dt) {
    let next: RefractState = { ...s, simTime: s.simTime + dt };
    const cues = new Set<string>();
    const transition = (after: RefractState, isClear = false) => {
      for (const b of after.beams) {
        const before = next.beams.find((p) => p.channel === b.channel);
        if (before && after.board === next.board) {
          if (b.cells.length > before.cells.length && b.cells.length > 1)
            cues.add(C.CUES.connect);
          if (
            b.cells.length < before.cells.length &&
            before.cells.length > 1 &&
            !isClear
          )
            cues.add(C.CUES.retract);
          if (complete(after, b) && !complete(next, before))
            cues.add(C.CUES.channelComplete);
        }
      }
      if (
        isClear &&
        next.beams.some((b) => b.cells.length > 1) &&
        !after.beams.some((b) => b.cells.length > 1)
      )
        cues.add(C.CUES.clear);
      if (
        next.screen === "playing" &&
        (after.screen === "solved" || after.screen === "complete")
      )
        cues.add(C.CUES.solved);
      next = after;
    };
    for (const a of C.ACTIONS)
      if (api.input.pressed(a)) {
        if (a === "mute") api.audio.setMuted(!api.audio.muted());
        else
          transition(
            action(next, a),
            a === "clear" && next.screen === "playing",
          );
      }
    for (const p of api.input.pointerSamples())
      if (p.primary && (p.type === "move" || p.button === "primary")) {
        const wasArmed = next.armedTarget;
        transition(
          pointer(next, p.type, p.x, p.y, p.device),
          p.type === "up" && wasArmed === "clear",
        );
      }
    transition(finish(next));
    const p = api.input.pointer();
    next = {
      ...next,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      muted: api.audio.muted(),
    };
    for (const cue of cues) api.audio.play(cue);
    return next;
  },
  render,
};
