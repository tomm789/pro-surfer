/** Riders and boards as data (design doc §8), and the stat blend rule (rider ~65%, board ~35%). */
import { z } from 'zod';
import ridersJson from '@data/riders.json';
import boardsJson from '@data/boards.json';

const StatPair = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]);
const StatKeys = ['spin', 'speed', 'air', 'balance'] as const;
export type StatKey = (typeof StatKeys)[number];

export const RiderDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  archetype: z.string(),
  home: z.string(),
  bio: z.string(),
  secret: z.boolean().default(false),
  unlock: z.string().optional(),
  stats: z.object({ spin: StatPair, speed: StatPair, air: StatPair, balance: StatPair }),
  look: z.object({ suit: z.string(), accent: z.string(), skin: z.string(), hair: z.string(), board: z.string(), boardAccent: z.string() }),
  specials: z.array(z.string()),
});
export type RiderDef = z.infer<typeof RiderDefSchema>;

export const BoardDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  unlock: z.string(),
  mods: z.object({ spin: z.number(), speed: z.number(), air: z.number(), balance: z.number() }),
  length: z.number().positive(),
  colour: z.string(),
});
export type BoardDef = z.infer<typeof BoardDefSchema>;

const riders = z.object({ riders: z.array(RiderDefSchema) }).parse(ridersJson).riders;
const boards = z.object({ boards: z.array(BoardDefSchema) }).parse(boardsJson).boards;

export function listRiders(): RiderDef[] {
  return riders;
}
export function getRider(id: string): RiderDef {
  const r = riders.find((x) => x.id === id);
  if (!r) throw new Error(`unknown rider ${id}`);
  return r;
}
export function listBoards(): BoardDef[] {
  return boards;
}
export function getBoard(id: string): BoardDef {
  const b = boards.find((x) => x.id === id);
  if (!b) throw new Error(`unknown board ${id}`);
  return b;
}

export interface Stats01 {
  spin: number;
  speed: number;
  air: number;
  balance: number;
}

/**
 * Effective 0..1 stats for the sim: rider base + career boosts (capped at the rider's max), blended with the
 * board's mods using the tuning weights. Boosts are 0..1 fractions of the base→max range.
 */
export function effectiveStats(rider: RiderDef, board: BoardDef, boosts: Stats01, weights: { riderWeight: number; boardWeight: number }): Stats01 {
  const out = { spin: 0, speed: 0, air: 0, balance: 0 };
  for (const k of StatKeys) {
    const [base, max] = rider.stats[k];
    const riderPct = Math.min(max, base + (max - base) * Math.min(1, boosts[k]));
    const blended = riderPct * weights.riderWeight + (riderPct + board.mods[k]) * weights.boardWeight;
    out[k] = Math.max(0.05, Math.min(1, blended / 100));
  }
  return out;
}

/** Ten-segment bar for menus. */
export function statBar(value01: number): string {
  const n = Math.round(value01 * 10);
  return '■'.repeat(n) + '□'.repeat(10 - n);
}

export { StatKeys };
