import { z } from 'zod';
import tricksJson from '@data/tricks.json';

export const DIRECTIONS = ['up', 'upRight', 'right', 'downRight', 'down', 'downLeft', 'left', 'upLeft'] as const;
export type Direction8 = (typeof DIRECTIONS)[number];
export type TrickButton = 'carve' | 'grab' | 'slide';
export type TrickSection = 'face' | 'air' | 'tube' | 'exit';

const Dir = z.enum(DIRECTIONS);
const Button = z.enum(['carve', 'grab', 'slide']);

export const TrickInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dir'), button: Button, direction: Dir }),
  z.object({ kind: z.literal('double'), button: Button, context: z.enum(['lip', 'face']).optional() }),
  z.object({ kind: z.literal('combo'), button: Button, then: Button }),
  z.object({ kind: z.literal('seq'), sequence: z.array(Dir).min(1).max(3), button: Button }),
  z.object({
    kind: z.literal('hold'),
    button: Button,
    with: Button.optional(),
    direction: z.literal('any'),
    holdRadians: z.number().positive().optional(),
    holdSeconds: z.number().positive().optional(),
  }),
  z.object({ kind: z.literal('exit'), sequence: z.array(Dir).min(1).max(2) }),
]);

/**
 * Where a foot is, in the terms the catalogue uses for the stick scheme (docs/MECHANICS.md §6):
 * pulled up, pressed down, pushed toe-side (toward the wall) or heel-side (toward the shore).
 */
export const FOOT_CUES = ['up', 'down', 'toe', 'heel'] as const;
export type FootCue = (typeof FOOT_CUES)[number];
const Foot = z.enum(FOOT_CUES);

/** The foot shape that selects an air trick while a grab button is held. Every listed cue must hold. */
export const FeetSchema = z.object({
  front: Foot.optional(),
  back: Foot.optional(),
  /** Feet pushing opposite ways: `out` = front toe / back heel, `in` = front heel / back toe. */
  twist: z.enum(['in', 'out']).optional(),
  /** Both feet pressed: a tucked grab. */
  tuck: z.boolean().optional(),
});
export type Feet = z.infer<typeof FeetSchema>;

export const TrickSchema = z.object({
  id: z.string(),
  name: z.string(),
  section: z.enum(['face', 'air', 'tube', 'exit']),
  input: TrickInputSchema,
  /** Stick scheme: the foot shape that means this trick while `input.button` is held in the air. */
  feet: FeetSchema.optional(),
  base: z.number().nonnegative(),
  meter: z.number(),
  duration: z.number().nonnegative(),
  special: z.boolean().default(false),
  icon: z.enum(['face', 'air', 'tube', 'special']).optional(),
  riders: z.array(z.string()).optional(),
});

export type Trick = z.infer<typeof TrickSchema>;
export type TrickInput = z.infer<typeof TrickInputSchema>;

/** What each foot is doing right now; a diagonal stick satisfies two cues at once. */
export interface FeetShape {
  front: Set<FootCue>;
  back: Set<FootCue>;
  twist: 'in' | 'out' | null;
  tuck: boolean;
}

/** Read the sticks into cues. `direction` is the wave direction, so toe-side is always toward the wall. */
export function feetShape(feet: { backX: number; backY: number; frontX: number; frontY: number }, direction: 1 | -1, threshold = 0.5): FeetShape {
  const cues = (x: number, y: number): Set<FootCue> => {
    const s = new Set<FootCue>();
    const side = direction * x;
    if (y > threshold) s.add('up');
    if (y < -threshold) s.add('down');
    if (side > threshold) s.add('toe');
    if (side < -threshold) s.add('heel');
    return s;
  };
  const tw = (direction * (feet.frontX - feet.backX)) / 2;
  return {
    front: cues(feet.frontX, feet.frontY),
    back: cues(feet.backX, feet.backY),
    twist: tw > threshold ? 'out' : tw < -threshold ? 'in' : null,
    tuck: feet.frontY < -threshold && feet.backY < -threshold,
  };
}

/** How well a shape matches a trick's feet: −1 for no match, otherwise how many cues it took (specificity). */
export function feetMatch(feet: Feet, shape: FeetShape): number {
  let n = 0;
  if (feet.front) {
    if (!shape.front.has(feet.front)) return -1;
    n++;
  }
  if (feet.back) {
    if (!shape.back.has(feet.back)) return -1;
    n++;
  }
  if (feet.twist) {
    if (shape.twist !== feet.twist) return -1;
    n++;
  }
  if (feet.tuck) {
    if (!shape.tuck) return -1;
    n++;
  }
  return n;
}

const CUE_WORDS: Record<FootCue, string> = { up: 'pulled up', down: 'pressed', toe: 'toe-side', heel: 'heel-side' };

/** Plain words for a foot shape, for the trick book and hints. */
export function describeFeet(feet: Feet): string {
  const parts: string[] = [];
  if (feet.front) parts.push(`front foot ${CUE_WORDS[feet.front]}`);
  if (feet.back) parts.push(`back foot ${CUE_WORDS[feet.back]}`);
  if (feet.twist) parts.push(feet.twist === 'out' ? 'feet twisted out (front toe, back heel)' : 'feet twisted in (front heel, back toe)');
  if (feet.tuck) parts.push('tucked');
  return parts.join(', ');
}

const CatalogueSchema = z.object({ tricks: z.array(TrickSchema) });

export class TrickCatalogue {
  readonly all: Trick[];
  private byId = new Map<string, Trick>();

  constructor(raw: unknown = tricksJson) {
    this.all = CatalogueSchema.parse(raw).tricks;
    for (const t of this.all) {
      if (this.byId.has(t.id)) throw new Error(`duplicate trick id ${t.id}`);
      this.byId.set(t.id, t);
    }
  }

  get(id: string): Trick {
    const t = this.byId.get(id);
    if (!t) throw new Error(`unknown trick ${id}`);
    return t;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  bySection(section: TrickSection): Trick[] {
    return this.all.filter((t) => t.section === section);
  }
}

export const TRICKS = new TrickCatalogue();
