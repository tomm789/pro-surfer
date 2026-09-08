import { z } from 'zod';

export const BeachSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  /** Which way the wave peels as seen from the beach. */
  breakDirection: z.enum(['right', 'left']),
  /** 0 = crumbly beach break, 1 = square, throwing barrel. */
  hollowness: z.number().min(0).max(1),
  /** Along-crest speed of the curl, m/s. */
  breakSpeed: z.number().positive(),
  /** Cross-section width factor (rx/ry). */
  faceAspect: z.number().positive(),
  /** Whether a rideable tube exists at this beach at all. */
  tube: z.boolean(),
  sections: z.object({
    /** Average sections per minute. */
    rate: z.number().nonnegative(),
    /** 0..1: how far ahead and how fast they close out. */
    severity: z.number().min(0).max(1),
    /** Curl approaches from both sides (sections spawn ahead and behind the rider). */
    doubleUp: z.boolean(),
  }),
  /**
   * Fixed zones along the venue (the pool): hollowness and height vary with position so a lap has a
   * barrel section, a wall and a ramp. Omit for ocean breaks, which vary through scheduled sections.
   */
  zones: z
    .object({
      /** Metres for one full barrel → wall → ramp → wall cycle. */
      wavelength: z.number().positive(),
      hollowAmp: z.number().min(0).max(1),
      heightAmp: z.number().min(0).max(1),
    })
    .optional(),
  /** Available hazards / objects (ids from data/objects). */
  hazards: z.array(z.string()),
  /** Look & feel (sky, water tint, landmarks) — presentation only. */
  look: z.object({
    sky: z.enum(['day', 'evening', 'dusk', 'night', 'cloudy']).default('day'),
    waterDeep: z.string(),
    waterShallow: z.string(),
    sunAzimuthDeg: z.number().default(210),
    sunElevationDeg: z.number().default(38),
    landmarks: z.array(z.string()).default([]),
  }),
});

export type Beach = z.infer<typeof BeachSchema>;

export function parseBeach(raw: unknown): Beach {
  return BeachSchema.parse(raw);
}

/** Feet (as the original listed wave sizes) → metres of face height, with a mild "video game scale" factor. */
export function waveFeetToMetres(ft: number, faceScale = 1.35): number {
  return ft * 0.3048 * faceScale;
}
