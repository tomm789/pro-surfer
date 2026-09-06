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

export const TrickSchema = z.object({
  id: z.string(),
  name: z.string(),
  section: z.enum(['face', 'air', 'tube', 'exit']),
  input: TrickInputSchema,
  base: z.number().nonnegative(),
  meter: z.number(),
  duration: z.number().nonnegative(),
  special: z.boolean().default(false),
  icon: z.enum(['face', 'air', 'tube', 'special']).optional(),
  riders: z.array(z.string()).optional(),
});

export type Trick = z.infer<typeof TrickSchema>;
export type TrickInput = z.infer<typeof TrickInputSchema>;

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
