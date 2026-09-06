import { LevelSchema, type Level } from './goals';

const modules = import.meta.glob('@data/levels/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const registry = new Map<string, Level>();
for (const [path, raw] of Object.entries(modules)) {
  const lvl = LevelSchema.parse(raw);
  if (registry.has(lvl.id)) throw new Error(`Duplicate level id ${lvl.id} in ${path}`);
  registry.set(lvl.id, lvl);
}

export function getLevel(id: string): Level {
  const l = registry.get(id);
  if (!l) throw new Error(`Unknown level '${id}'`);
  return l;
}

/** Career levels (the world map), in order. Lessons are listed separately. */
export function listLevels(): Level[] {
  return [...registry.values()].filter((l) => !l.lesson).sort((a, b) => a.order - b.order);
}

/** Tutorial lessons in order. */
export function listLessons(): Level[] {
  return [...registry.values()].filter((l) => l.lesson).sort((a, b) => a.order - b.order);
}

export function levelsForBeach(beachId: string): Level[] {
  return listLevels().filter((l) => l.beach === beachId);
}
