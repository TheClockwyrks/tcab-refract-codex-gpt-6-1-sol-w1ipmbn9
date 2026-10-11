import { CHANNELS } from "./constants";
import type { BoardState, Cell } from "./game";

/** Exhaustive route enumeration and solution measurement, used to certify the
 * generator's candidates. Edges and crossing diagonals use disjoint bitsets. */
export interface Route {
  readonly cells: readonly Cell[];
  readonly edges: bigint;
  readonly blocked: bigint;
  readonly counts: readonly number[];
  readonly choices: readonly {
    edges: bigint;
    blocked: bigint;
    crystal: number;
    remaining: number;
  }[][];
}
export interface Analysis {
  readonly routes: readonly (readonly Route[])[];
  readonly solutions: number;
  readonly determinedShare: number;
  readonly branching: number;
  readonly shared: number;
}
export function analyze(
  board: BoardState,
  maxSolutions = 256,
  budget = 2000000,
): Analysis | null {
  const nodes = board.nodes;
  const crystals = nodes.filter((n) => n.kind === "crystal");
  const crystalIndex = nodes.map((n) => crystals.indexOf(n));
  const channels = CHANNELS.filter((ch) => nodes.some((n) => n.channel === ch));
  const edgeTable = new Map<string, number>();
  const edges: { a: number; b: number; mask: bigint; block: bigint }[] = [];
  const adjacent = nodes.map(() => [] as number[]);
  const key = (a: number, b: number) => `${Math.min(a, b)},${Math.max(a, b)}`;
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++)
      if (
        Math.max(
          Math.abs(nodes[a].col - nodes[b].col),
          Math.abs(nodes[a].row - nodes[b].row),
        ) === 1
      ) {
        const index = edges.length;
        edgeTable.set(key(a, b), index);
        edges.push({ a, b, mask: 1n << BigInt(index), block: 0n });
        adjacent[a].push(b);
        adjacent[b].push(a);
      }
  for (const e of edges) {
    const a = nodes[e.a],
      b = nodes[e.b];
    if (a.col !== b.col && a.row !== b.row)
      for (const other of edges) {
        const c = nodes[other.a],
          d = nodes[other.b];
        if (
          c.col !== d.col &&
          c.row !== d.row &&
          a.col + b.col === c.col + d.col &&
          a.row + b.row === c.row + d.row &&
          other !== e
        )
          e.block |= other.mask;
      }
  }
  const routes: Route[][] = [];
  let steps = 0;
  for (const channel of channels) {
    const emitters = nodes
      .map((n, i) => (n.kind === "emitter" && n.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    if (emitters.length !== 2) return null;
    const lenses = nodes
      .map((n, i) => (n.kind === "lens" && n.channel === channel ? i : -1))
      .filter((i) => i >= 0);
    const lensMask = lenses.reduce((m, i) => m | (1n << BigInt(i)), 0n);
    const list: Route[] = [];
    const seen = new Set<string>();
    const path = [emitters[0]],
      counts = crystals.map(() => 0),
      choices: Route["choices"][number][] = [];
    const dfs = (
      at: number,
      visited: bigint,
      used: bigint,
      blocked: bigint,
    ) => {
      if (++steps > budget) return;
      if (at === emitters[1]) {
        if ((visited & lensMask) !== lensMask) return;
        const signature = String(used);
        if (!seen.has(signature)) {
          seen.add(signature);
          list.push({
            cells: path.map((i) => ({ col: nodes[i].col, row: nodes[i].row })),
            edges: used,
            blocked,
            counts: [...counts],
            choices: choices.map((c) => [...c]),
          });
        }
        return;
      }
      const moves = adjacent[at].filter((i) => {
        const n = nodes[i],
          ci = crystalIndex[i],
          edge = edges[edgeTable.get(key(at, i))!];
        return (
          (n.channel === null || n.channel === channel) &&
          !(edge.mask & (used | blocked)) &&
          (ci >= 0
            ? counts[ci] < (n.charges ?? 0)
            : !(visited & (1n << BigInt(i))))
        );
      });
      // A lens without a remaining exit cannot be threaded. Connectivity is
      // checked only for the unvisited nodes, so it never excludes a revisit.
      const reachable = new Set<number>([at]);
      const queue = [at];
      for (let k = 0; k < queue.length; k++)
        for (const i of adjacent[queue[k]]) {
          if (reachable.has(i)) continue;
          const n = nodes[i],
            ci = crystalIndex[i],
            edge = edges[edgeTable.get(key(queue[k], i))!];
          if (
            (n.channel !== null && n.channel !== channel) ||
            edge.mask & (used | blocked) ||
            (ci < 0 && visited & (1n << BigInt(i))) ||
            (ci >= 0 && counts[ci] >= (n.charges ?? 0))
          )
            continue;
          reachable.add(i);
          if (n.kind !== "emitter" || i === at) queue.push(i);
        }
      if (
        !reachable.has(emitters[1]) ||
        lenses.some((i) => !(visited & (1n << BigInt(i))) && !reachable.has(i))
      )
        return;
      choices.push(
        moves.map((i) => {
          const e = edges[edgeTable.get(key(at, i))!];
          return {
            edges: e.mask,
            blocked: e.block,
            crystal: crystalIndex[i],
            remaining: (nodes[i].charges ?? 0) - (counts[crystalIndex[i]] ?? 0),
          };
        }),
      );
      for (const i of moves) {
        const e = edges[edgeTable.get(key(at, i))!],
          ci = crystalIndex[i];
        path.push(i);
        if (ci >= 0) counts[ci]++;
        dfs(i, visited | (1n << BigInt(i)), used | e.mask, blocked | e.block);
        if (ci >= 0) counts[ci]--;
        path.pop();
        if (steps > budget) break;
      }
      choices.pop();
    };
    dfs(emitters[0], 1n << BigInt(emitters[0]), 0n, 0n);
    if (steps > budget || !list.length) return null;
    routes.push(list);
  }
  let solutions = 0,
    branchTotal = 0,
    shared = 0;
  let common: bigint[] = channels.map(() => 0n);
  const picked: Route[] = [];
  const counts = crystals.map(() => 0);
  const combine = (index: number, used: bigint, blocked: bigint) => {
    if (++steps > budget || solutions > maxSolutions) return;
    if (index === channels.length) {
      if (counts.some((n, i) => n !== crystals[i].charges)) return;
      solutions++;
      common =
        solutions === 1
          ? picked.map((r) => r.edges)
          : common.map((m, i) => m & picked[i].edges);
      shared = Math.max(
        shared,
        crystals.filter(
          (_, i) => picked.filter((r) => r.counts[i] > 0).length >= 2,
        ).length,
      );
      let prevUsed = 0n,
        prevBlock = 0n;
      const prevCounts = crystals.map(() => 0);
      for (const r of picked) {
        branchTotal += r.choices.reduce(
          (n, moves) =>
            n +
            moves.filter(
              (m) =>
                !(m.edges & (prevUsed | prevBlock)) &&
                !(m.blocked & prevUsed) &&
                (m.crystal < 0 || prevCounts[m.crystal] < m.remaining),
            ).length,
          0,
        );
        prevUsed |= r.edges;
        prevBlock |= r.blocked;
        r.counts.forEach((n, i) => (prevCounts[i] += n));
      }
      return;
    }
    for (const r of routes[index]) {
      if (
        r.edges & (used | blocked) ||
        r.blocked & used ||
        r.counts.some((n, i) => n + counts[i] > (crystals[i].charges ?? 0))
      )
        continue;
      r.counts.forEach((n, i) => (counts[i] += n));
      picked.push(r);
      combine(index + 1, used | r.edges, blocked | r.blocked);
      picked.pop();
      r.counts.forEach((n, i) => (counts[i] -= n));
      if (solutions > maxSolutions || steps > budget) return;
    }
  };
  combine(0, 0n, 0n);
  if (steps > budget || solutions > maxSolutions || !solutions) return null;
  const length =
    nodes.filter((n) => n.kind === "lens").length +
    channels.length +
    crystals.reduce((n, c) => n + (c.charges ?? 0), 0);
  const pop = (n: bigint) => n.toString(2).replace(/0/g, "").length;
  return {
    routes,
    solutions,
    determinedShare: common.reduce((n, m) => n + pop(m), 0) / length,
    branching: branchTotal / (length * solutions),
    shared,
  };
}
