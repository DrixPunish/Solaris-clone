import { BUILDINGS, RESEARCH } from '@/constants/gameData';
import { Prerequisite } from '@/types/game';

const nameMap = new Map<string, string>();

for (const b of BUILDINGS) {
  nameMap.set(b.id, b.name);
}
for (const r of RESEARCH) {
  nameMap.set(r.id, r.name);
}

export function getPrereqLabel(prereq: Prerequisite): string {
  const name = nameMap.get(prereq.id) ?? prereq.id;
  return `${name} Nv.${prereq.level}`;
}

export function getMissingPrereqLabels(
  prerequisites: Prerequisite[] | undefined,
  buildings: Record<string, number>,
  research: Record<string, number>,
): string[] {
  if (!prerequisites || prerequisites.length === 0) return [];
  const missing: string[] = [];
  for (const prereq of prerequisites) {
    const currentLevel = prereq.type === 'building'
      ? (buildings[prereq.id] ?? 0)
      : (research[prereq.id] ?? 0);
    if (currentLevel < prereq.level) {
      missing.push(getPrereqLabel(prereq));
    }
  }
  return missing;
}
