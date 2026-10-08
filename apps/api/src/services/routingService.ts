import { boundsArea, pointInBounds } from '@civicfix/shared';
import { prisma } from '../lib/prisma.js';

export type RoutingResult =
  | {
      kind: 'mapped';
      areaId: string;
      jurisdictionId: string;
      departmentId: string;
      mappingId: string;
      defaultOfficerUserId?: string;
      defaultTeamId?: string;
    }
  | { kind: 'unmapped'; areaId?: string; jurisdictionId?: string };

export async function resolveLocation(lat: number, lng: number) {
  const areas = await prisma.area.findMany({
    where: { isActive: true, deletedAt: null },
    include: { jurisdiction: true },
  });
  const matches = areas.filter(
    (a) => a.jurisdiction.isActive && pointInBounds(lat, lng, a),
  );
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => boundsArea(a) - boundsArea(b));
  return matches[0];
}

export async function routeComplaint(input: {
  latitude: number;
  longitude: number;
  categoryId?: string;
}): Promise<RoutingResult> {
  const area = await resolveLocation(input.latitude, input.longitude);
  if (!area) return { kind: 'unmapped' };
  if (!input.categoryId) {
    return { kind: 'unmapped', areaId: area.id, jurisdictionId: area.jurisdictionId };
  }

  const mapping = await prisma.responsibilityMapping.findFirst({
    where: {
      areaId: area.id,
      categoryId: input.categoryId,
      isActive: true,
    },
    include: { defaultOfficer: true },
  });

  if (!mapping) {
    return { kind: 'unmapped', areaId: area.id, jurisdictionId: area.jurisdictionId };
  }

  return {
    kind: 'mapped',
    areaId: area.id,
    jurisdictionId: area.jurisdictionId,
    departmentId: mapping.departmentId,
    mappingId: mapping.id,
    defaultOfficerUserId: mapping.defaultOfficer?.userId,
    defaultTeamId: mapping.defaultTeamId ?? undefined,
  };
}
