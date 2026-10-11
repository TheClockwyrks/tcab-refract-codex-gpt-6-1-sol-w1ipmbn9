import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { cellX, cellY, complete, menuItems, spent, targets } from "./game";
import type { Channel, ReadState, Target } from "./game";
const INK = "#e4edf5",
  QUIET = "#8293a9",
  LINE = "#243244",
  ACCENT = "#9cf1d5";
export const COLORS: Record<Channel, string> = {
  triangle: "#9cf1d5",
  square: "#f6b878",
  diamond: "#b9a3ff",
};
type Context = RenderApi["ctx"];
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  align: CanvasTextAlign = "left",
  weight = 400,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${size < 17 ? "monospace" : '"Trebuchet MS", sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  a: number,
  b: number,
  color = LINE,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(a, b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function polygon(
  ctx: Context,
  x: number,
  y: number,
  channel: Channel,
  r: number,
) {
  ctx.beginPath();
  const points =
    channel === "triangle"
      ? [
          [0, -r],
          [r * 0.87, r * 0.5],
          [-r * 0.87, r * 0.5],
        ]
      : channel === "square"
        ? [
            [-r * 0.7, -r * 0.7],
            [r * 0.7, -r * 0.7],
            [r * 0.7, r * 0.7],
            [-r * 0.7, r * 0.7],
          ]
        : [
            [0, -r],
            [r, 0],
            [0, r],
            [-r, 0],
          ];
  points.forEach(([a, b], i) =>
    i ? ctx.lineTo(x + a, y + b) : ctx.moveTo(x + a, y + b),
  );
  ctx.closePath();
}
function button(
  ctx: Context,
  t: Target,
  label: string,
  selected = false,
  sub = "",
) {
  ctx.fillStyle = selected ? "#16332f" : "#101c2a";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = selected ? ACCENT : LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  if (selected) {
    ctx.fillStyle = ACCENT;
    ctx.fillRect(t.x, t.y, 3, t.h);
  }
  text(
    ctx,
    label,
    t.x + 25,
    t.y + t.h / 2,
    19,
    selected ? ACCENT : INK,
    "left",
    600,
  );
  if (sub) text(ctx, sub, t.x + t.w - 22, t.y + t.h / 2, 12, QUIET, "right");
  else if (selected) text(ctx, "↗", t.x + t.w - 28, t.y + t.h / 2, 23, ACCENT);
}
function chrome(ctx: Context, section: string) {
  text(ctx, "R /", 64, 43, 23, ACCENT, "left", 700);
  text(ctx, "REFRACT", 116, 43, 14, INK);
  text(ctx, section, 1216, 43, 13, QUIET, "right");
  line(ctx, 64, 76, 1216, 76);
  text(ctx, "OPTICAL STUDIES  /  01", 64, 685, 12, QUIET);
  text(ctx, "M  SOUND     ·     ESC  BACK", 1216, 685, 12, QUIET, "right");
}
function bench(ctx: Context, s: ReadState) {
  const left = cellX(0, s.board.cols) - 47,
    top = cellY(0, s.board.rows) - 47;
  ctx.fillStyle = "#0c1723";
  ctx.fillRect(
    left,
    top,
    s.board.cols * C.CELL_PITCH - 2,
    s.board.rows * C.CELL_PITCH - 2,
  );
  ctx.strokeStyle = LINE;
  ctx.strokeRect(
    left,
    top,
    s.board.cols * C.CELL_PITCH - 2,
    s.board.rows * C.CELL_PITCH - 2,
  );
  for (let row = 0; row < s.board.rows; row++)
    for (let col = 0; col < s.board.cols; col++) {
      const x = cellX(col, s.board.cols),
        y = cellY(row, s.board.rows);
      line(ctx, x - 4, y, x + 4, y, "#253548");
      line(ctx, x, y - 4, x, y + 4, "#253548");
    }
  for (const b of s.beams) {
    if (b.cells.length < 2) continue;
    ctx.beginPath();
    b.cells.forEach((c, i) =>
      i
        ? ctx.lineTo(cellX(c.col, s.board.cols), cellY(c.row, s.board.rows))
        : ctx.moveTo(cellX(c.col, s.board.cols), cellY(c.row, s.board.rows)),
    );
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = COLORS[b.channel];
    ctx.shadowColor = COLORS[b.channel];
    ctx.shadowBlur = 17;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#f1fff8";
    ctx.stroke();
  }
  for (const n of s.board.nodes) {
    const x = cellX(n.col, s.board.cols),
      y = cellY(n.row, s.board.rows);
    ctx.fillStyle = "#0c1723";
    ctx.beginPath();
    ctx.arc(x, y, C.NODE_R, 0, Math.PI * 2);
    ctx.fill();
    if (n.kind === "crystal") {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const a = x + 27 * Math.cos(angle),
          b = y + 27 * Math.sin(angle);
        if (i) ctx.lineTo(a, b);
        else ctx.moveTo(a, b);
      }
      ctx.closePath();
      ctx.fillStyle = "#202c3d";
      ctx.fill();
      ctx.strokeStyle = "#a7bad1";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(
        ctx,
        `${spent(s, n)}/${n.charges}`,
        x,
        y - 3,
        16,
        INK,
        "center",
        600,
      );
      for (let i = 0; i < (n.charges ?? 0); i++) {
        ctx.fillStyle = i < spent(s, n) ? ACCENT : "#4d5d70";
        ctx.beginPath();
        ctx.arc(
          x + (i - ((n.charges ?? 0) - 1) / 2) * 9,
          y + 14,
          2.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      const color = COLORS[n.channel!];
      polygon(ctx, x, y, n.channel!, 23);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      if (n.kind === "lens") {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (
      s.tracing &&
      s.beams.find((b) => b.channel === s.tracing?.channel)?.cells.slice(-1)[0]
        ?.col === n.col &&
      s.beams.find((b) => b.channel === s.tracing?.channel)?.cells.slice(-1)[0]
        ?.row === n.row
    ) {
      ctx.strokeStyle = COLORS[s.tracing.channel];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 35, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
function titleArt(ctx: Context) {
  const x = 810,
    y = 354;
  ctx.strokeStyle = "#192b39";
  ctx.lineWidth = 1;
  for (let r = 70; r <= 260; r += 48) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    line(
      ctx,
      x + 65 * Math.cos(a),
      y + 65 * Math.sin(a),
      x + 277 * Math.cos(a),
      y + 277 * Math.sin(a),
      "#152633",
    );
  }
  const routes = [
    [
      [660, 480],
      [756, 384],
      [852, 384],
      [948, 288],
      [948, 192],
    ],
    [
      [660, 192],
      [756, 288],
      [852, 288],
      [948, 384],
      [1044, 480],
    ],
    [
      [660, 288],
      [660, 384],
      [756, 480],
      [852, 480],
      [948, 576],
    ],
  ];
  routes.forEach((route, i) => {
    const channel = C.CHANNELS[i];
    ctx.beginPath();
    route.forEach(([a, b], j) => (j ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
    ctx.strokeStyle = COLORS[channel];
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS[channel];
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;
    route.forEach(([a, b], j) => {
      polygon(ctx, a, b, channel, 20);
      ctx.fillStyle =
        j === 0 || j === route.length - 1 ? "#0b1420" : COLORS[channel];
      ctx.fill();
      ctx.strokeStyle = COLORS[channel];
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });
  text(
    ctx,
    "THREE CHANNELS. INFINITE POSSIBILITIES.",
    835,
    633,
    12,
    QUIET,
    "center",
  );
}
export function render(s: ReadState, { ctx }: RenderApi): void {
  ctx.save();
  const gradient = ctx.createLinearGradient(0, 0, C.STAGE_W, C.STAGE_H);
  gradient.addColorStop(0, "#101b29");
  gradient.addColorStop(1, "#080f19");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  chrome(
    ctx,
    s.screen === "title" ? "A PUZZLE OF LIGHT" : s.mode.toUpperCase(),
  );
  if (s.screen === "title") {
    titleArt(ctx);
    text(ctx, "TRACE / CONNECT / RESOLVE", 100, 175, 13, ACCENT);
    text(ctx, C.TITLE_TEXT, 94, 247, 82, INK, "left", 700);
    text(ctx, C.TAGLINE_TEXT, 100, 317, 20, QUIET);
    targets(s).forEach((t, i) =>
      button(
        ctx,
        t,
        C.TITLE_ITEMS[i],
        s.menuIndex === i,
        ["24 STUDIES", "ENDLESS", "THE RULES"][i],
      ),
    );
  } else if (s.screen === "howto") {
    text(
      ctx,
      "A little light goes a long way.",
      100,
      135,
      36,
      INK,
      "left",
      600,
    );
    const lessons = [
      [
        "01  DRAW A BEAM",
        "Press an outlined emitter. Drag through neighboring nodes; release to leave your beam.",
        "Each channel has two emitters. Connect them through every filled lens of its shape.",
      ],
      [
        "02  FIND YOUR ROUTE",
        "Move to any of eight neighboring nodes, diagonals included. Never skip an empty cell.",
        "Stay on your channel. A segment is used once; the two diagonals of a square cannot cross.",
      ],
      [
        "03  SPEND THE CRYSTALS",
        "Any channel can cross a crystal. Spend every charge, exactly, and leave each crossing.",
        "Crystal counters show spent / total. A move that breaks a rule simply stays undrawn.",
      ],
      [
        "04  CHANGE YOUR MIND",
        "Drag back one node to unwind. Press an end to resume, or a beam's middle to shorten.",
        "R clears the board · Escape returns · M toggles sound · Arrows + Enter work the menus.",
      ],
    ];
    lessons.forEach(([title, a, b], i) => {
      const y = 218 + i * 96;
      text(ctx, title, 100, y, 13, ACCENT);
      text(ctx, a, 100, y + 29, 19);
      text(ctx, b, 100, y + 55, 17, QUIET);
    });
    button(ctx, targets(s)[0], C.BACK_LABEL);
  } else if (s.screen === "select") {
    text(ctx, "The campaign", 100, 133, 38, INK, "left", 600);
    text(
      ctx,
      `${s.solvedBoards.length} / ${C.CAMPAIGN_LENGTH} STUDIES RESOLVED`,
      1180,
      140,
      13,
      ACCENT,
      "right",
    );
    C.SET_LABELS.forEach((label, i) =>
      text(ctx, label, 173, 264 + i * 91, 14, QUIET),
    );
    targets(s).forEach((t, i) => {
      if (t.id === "back") {
        button(ctx, t, C.BACK_LABEL);
        return;
      }
      const done = s.solvedBoards.includes(i),
        locked = i >= s.unlockedCount;
      ctx.fillStyle = s.selectIndex === i ? "#17342f" : "#101d2a";
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = s.selectIndex === i ? ACCENT : LINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
      text(
        ctx,
        String(i + 1).padStart(2, "0"),
        t.x + t.w / 2,
        t.y + 28,
        25,
        locked ? "#53657c" : INK,
        "center",
        600,
      );
      text(
        ctx,
        done ? "✓ SOLVED" : locked ? "LOCKED" : "OPEN",
        t.x + t.w / 2,
        t.y + 57,
        10,
        done ? ACCENT : QUIET,
        "center",
      );
    });
  } else {
    bench(ctx, s);
    text(
      ctx,
      s.mode === "campaign"
        ? `STUDY ${String(s.boardIndex + 1).padStart(2, "0")}`
        : "CASCADE",
      72,
      136,
      25,
      INK,
      "left",
      600,
    );
    text(
      ctx,
      s.mode === "campaign"
        ? `${C.SET_LABELS[Math.floor(s.boardIndex / 6)]} / ${C.CAMPAIGN_LENGTH} STUDIES`
        : `${C.HUD_SOLVED_LABEL} ${s.solvedCount}    ${C.HUD_TIER_LABEL} ${s.tier}`,
      72,
      178,
      13,
      QUIET,
    );
    text(ctx, "CHANNELS", 1064, 190, 12, QUIET);
    s.beams.forEach((b, i) => {
      const y = 238 + i * 70;
      polygon(ctx, 1081, y, b.channel, 13);
      ctx.fillStyle = COLORS[b.channel];
      ctx.fill();
      text(
        ctx,
        complete(s, b) ? "COMPLETE" : "OPEN",
        1107,
        y,
        12,
        COLORS[b.channel],
      );
    });
    text(ctx, "CONNECT BOTH ENDS", 72, 264, 12, ACCENT);
    text(ctx, "Thread every lens.", 72, 296, 17, QUIET);
    text(ctx, "Spend each charge.", 72, 324, 17, QUIET);
    if (s.screen === "playing")
      targets(s).forEach((t) =>
        button(
          ctx,
          t,
          t.id === "clear" ? C.CLEAR_LABEL : C.BACK_LABEL,
          false,
          t.id === "clear" ? "R" : "ESC",
        ),
      );
    if (s.screen === "solved" || s.screen === "complete") {
      ctx.fillStyle = "#080f19ed";
      ctx.fillRect(40, 205, 280, 435);
      ctx.strokeStyle = LINE;
      ctx.strokeRect(40, 205, 280, 435);
      text(
        ctx,
        s.screen === "complete" ? "COURSE COMPLETE" : C.SOLVED_TITLE_TEXT,
        64,
        250,
        22,
        ACCENT,
        "left",
        600,
      );
      text(
        ctx,
        s.screen === "complete"
          ? `All ${C.CAMPAIGN_LENGTH} studies resolved.`
          : s.mode === "campaign"
            ? `Study ${s.boardIndex + 1} resolved.`
            : `${s.solvedCount} boards resolved.`,
        64,
        295,
        17,
        QUIET,
      );
      targets(s).forEach((t, i) =>
        button(ctx, t, menuItems(s)[i], s.menuIndex === i),
      );
    }
    text(
      ctx,
      s.screen !== "playing"
        ? "ALL CHANNELS IN BALANCE"
        : s.tracing
          ? "TRACING  /  RELEASE TO KEEP"
          : "PRESS AN EMITTER TO BEGIN",
      640,
      689,
      12,
      s.tracing ? ACCENT : QUIET,
      "center",
    );
  }
  ctx.restore();
}
