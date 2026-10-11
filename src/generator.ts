import { CHANNELS, TIERS } from "./constants";
import { CASCADE_BOARDS } from "./cascade-boards";
import { parseBoard } from "./game";
import { analyze } from "./solver";

/** Reject a candidate unless its exhaustive solution set meets every floor.
 * A budget exhaustion is a rejection, never evidence that a board is valid. */
export function qualifies(lines: readonly string[], tier: number): boolean {
  const rules = TIERS[tier - 1];
  if (!rules) return false;
  const board = parseBoard(lines),
    crystals = board.nodes.filter((n) => n.kind === "crystal");
  if (
    board.cols < rules.minCols ||
    board.cols > rules.maxCols ||
    board.rows < rules.minRows ||
    board.rows > rules.maxRows ||
    board.cols * board.rows - board.nodes.length > rules.maxEmptyCells ||
    crystals.length < rules.minCrystals ||
    crystals.length > rules.maxCrystals ||
    crystals.some(
      (n) => n.charges! < rules.minCharges || n.charges! > rules.maxCharges,
    )
  )
    return false;
  const channels = CHANNELS.filter((ch) =>
    board.nodes.some((n) => n.channel === ch),
  );
  if (
    channels.length !== rules.channels ||
    channels.some((ch, i) => ch !== CHANNELS[i])
  )
    return false;
  const result = analyze(board, rules.maxSolutions);
  return (
    result !== null &&
    result.routes.every((r) => r.length >= rules.minRoutes) &&
    result.solutions >= rules.minSolutions &&
    result.determinedShare <= rules.maxDeterminedShare &&
    result.branching >= rules.minBranching &&
    result.shared >= rules.minSharedCrystals
  );
}
/** Grid dimensions are sampled independently. Certified seeds ensure bounded
 * generation time; random node exchanges explore new arrangements, and only
 * exhaustively certified variants reach play. Reflection preserves all floors. */
export function generate(tier: number): readonly string[] {
  const rules = TIERS[tier - 1];
  if (!rules) throw new Error(`Invalid tier: ${tier}`);
  const cols =
    rules.minCols +
    Math.floor(Math.random() * (rules.maxCols - rules.minCols + 1));
  const rows =
    rules.minRows +
    Math.floor(Math.random() * (rules.maxRows - rules.minRows + 1));
  const pool = CASCADE_BOARDS[tier - 1].filter(
    (b) => b[0].length === cols && b.length === rows,
  );
  if (!pool.length)
    throw new Error(`No certified board for ${tier}: ${cols}x${rows}`);
  let board = [...pool[Math.floor(Math.random() * pool.length)]];
  for (let trial = 0; trial < 6; trial++) {
    const cells = board.join("").split("");
    const a = Math.floor(Math.random() * cells.length),
      b = Math.floor(Math.random() * cells.length);
    if (cells[a] === cells[b]) continue;
    [cells[a], cells[b]] = [cells[b], cells[a]];
    if (Math.random() < 0.3 && /^[123]$/.test(cells[a]))
      cells[a] = String(
        rules.minCharges +
          Math.floor(Math.random() * (rules.maxCharges - rules.minCharges + 1)),
      );
    const candidate = Array.from({ length: rows }, (_, r) =>
      cells.slice(r * cols, (r + 1) * cols).join(""),
    );
    if (qualifies(candidate, tier)) {
      board = candidate;
      break;
    }
  }
  if (Math.random() < 0.5) board.reverse();
  return Math.random() < 0.5
    ? board.map((r) => [...r].reverse().join(""))
    : board;
}
