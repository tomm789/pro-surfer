import { parseBeach, type Beach } from './beach';

const modules = import.meta.glob('@data/beaches/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const registry = new Map<string, Beach>();
for (const [path, raw] of Object.entries(modules)) {
  const beach = parseBeach(raw);
  if (registry.has(beach.id)) throw new Error(`Duplicate beach id ${beach.id} in ${path}`);
  registry.set(beach.id, beach);
}

export function getBeach(id: string): Beach {
  const b = registry.get(id);
  if (!b) throw new Error(`Unknown beach '${id}'. Known: ${[...registry.keys()].join(', ')}`);
  return b;
}

export function listBeaches(): Beach[] {
  return [...registry.values()];
}
