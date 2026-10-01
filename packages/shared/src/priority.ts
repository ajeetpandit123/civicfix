import type { Priority } from './constants.js';

export type PrioritySignals = {
  durationDays?: number;
  healthRisk: boolean;
  publicSafetyRisk: boolean;
  obstruction: boolean;
  affectedPeople?: number;
  categoryCode?: string;
};

const CRITICAL_CATEGORIES = new Set(['WATER_LEAKAGE', 'ROADS', 'DRAINAGE']);

export function computeSystemPriority(signals: PrioritySignals): {
  priority: Priority;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 1;

  if (signals.publicSafetyRisk) {
    score += 3;
    reasons.push('Public safety risk indicated');
  }
  if (signals.healthRisk) {
    score += 3;
    reasons.push('Public health risk indicated');
  }
  if (signals.obstruction) {
    score += 1;
    reasons.push('Obstruction of public space');
  }
  if ((signals.durationDays ?? 0) >= 5) {
    score += 1;
    reasons.push(`Issue duration ${signals.durationDays} days`);
  } else if ((signals.durationDays ?? 0) >= 2) {
    reasons.push(`Issue duration ${signals.durationDays} days`);
  }
  if ((signals.affectedPeople ?? 0) >= 50) {
    score += 2;
    reasons.push('Many people potentially affected');
  }
  if (signals.categoryCode && CRITICAL_CATEGORIES.has(signals.categoryCode)) {
    score += 1;
    reasons.push(`Category ${signals.categoryCode} has elevated baseline risk`);
  }

  let priority: Priority = 'LOW';
  if (score >= 7) priority = 'CRITICAL';
  else if (score >= 5) priority = 'HIGH';
  else if (score >= 3) priority = 'MEDIUM';

  if (reasons.length === 0) reasons.push('Default priority from limited signals');
  return { priority, reasons };
}

export function mergePriority(ai?: Priority, system?: Priority): Priority {
  const rank: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  if (!ai) return system ?? 'MEDIUM';
  if (!system) return ai;
  return rank[ai] >= rank[system] ? ai : system;
}
