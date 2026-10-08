/**
 * Verifies the dev database has a COMPLETE data-driven routing matrix:
 * every (category x area) must resolve to a department, a responsible officer
 * and a crew — the exact chain the product needs
 * (AI category -> department -> jurisdiction -> officer -> field worker).
 *
 * Usage: node scripts/verify-routing-data.mjs
 * Prints ROUTING_DATA_OK (exit 0) or the specific gap (exit 1).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const problems = [];

function check(ok, label, detail = '') {
  if (ok) {
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    problems.push(label);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function resolveChain(areaCode, categoryCode) {
  const area = await prisma.area.findFirst({ where: { code: areaCode }, include: { jurisdiction: true } });
  const category = await prisma.complaintCategory.findUnique({ where: { code: categoryCode } });
  if (!area || !category) return { area, category };
  const mapping = await prisma.responsibilityMapping.findUnique({
    where: { areaId_categoryId: { areaId: area.id, categoryId: category.id } },
    include: {
      department: true,
      defaultOfficer: { include: { user: { select: { id: true, name: true, email: true, role: true, status: true } }, department: true, jurisdiction: true } },
      defaultTeam: { include: { members: { include: { user: { select: { id: true, name: true, role: true, status: true } } } } } },
    },
  });
  return { area, category, mapping };
}

async function main() {
  // 1. The spec walkthrough chain: Street Lighting -> Electrical -> Jahangirpuri -> officer + worker
  const walk = await resolveChain('JAHANGIRPURI-WARD', 'STREETLIGHT');
  check(Boolean(walk.area?.jurisdiction?.name === 'Jahangirpuri'), 'Jahangirpuri area resolves to Jahangirpuri jurisdiction', walk.area?.jurisdiction?.name ?? 'missing');
  check(walk.category?.defaultDepartment?.code !== undefined || Boolean(walk.category), 'Street Lighting category exists', walk.category?.name ?? 'missing');
  const walkMapping = walk.mapping;
  check(Boolean(walkMapping), 'Street Lighting x Jahangirpuri has a ResponsibilityMapping', walkMapping ? '' : 'no mapping row');
  check(walkMapping?.department?.name === 'Electrical Department', 'Street Lighting maps to Electrical Department', walkMapping?.department?.name ?? 'none');
  check(walkMapping?.defaultOfficer?.user?.role === 'OFFICER' && walkMapping?.defaultOfficer?.user?.status === 'ACTIVE', 'Responsible officer exists and is an ACTIVE OFFICER', walkMapping?.defaultOfficer?.user?.name ?? 'none');
  check(walkMapping?.defaultOfficer?.jurisdiction?.name === 'Jahangirpuri' && walkMapping?.defaultOfficer?.department?.name === 'Electrical Department', 'Officer is scoped to Electrical / Jahangirpuri', walkMapping?.defaultOfficer?.user?.email ?? 'none');
  check(Boolean(walkMapping?.defaultOfficer?.employeeId), 'Officer carries an employee id', walkMapping?.defaultOfficer?.employeeId ?? 'none');
  check(Boolean(walkMapping?.defaultTeam), 'Default crew (field team) is set', walkMapping?.defaultTeam?.name ?? 'none');
  const walkWorkers = walkMapping?.defaultTeam?.members ?? [];
  check(walkWorkers.some((m) => m.user.role === 'FIELD_WORKER' && m.user.status === 'ACTIVE'), 'Crew has an ACTIVE field worker', walkWorkers.map((m) => m.user.name).join(', ') || 'none');
  check(walkWorkers.some((m) => m.employeeId === 'EL-1023'), 'Rahul Kumar (EL-1023) is on the Jahangirpuri electrical crew', 'EL-1023');
  check(walkMapping?.defaultOfficer?.employeeId === 'ELEC-204', 'Priya Sharma (ELEC-204) is the responsible officer', walkMapping?.defaultOfficer?.employeeId ?? 'none');

  if (walkMapping) {
    console.log(
      `\nCHAIN Street Lighting -> ${walkMapping.department.name} -> ${walk.area.jurisdiction.name} -> ` +
        `${walkMapping.defaultOfficer.user.name} -> ${walkWorkers.map((m) => m.user.name).join('/')}`,
    );
  }

  // 2. The legacy demo chain must keep working (Garbage -> Sanitation -> Adarsh Nagar)
  const demo = await resolveChain('ADARSH-NAGAR', 'WASTE_MANAGEMENT');
  check(demo.mapping?.department?.name?.startsWith('Sanitation') === true, 'Demo chain: Garbage -> Sanitation / Cleaning Department', demo.mapping?.department?.name ?? 'none');
  check(Boolean(demo.mapping?.defaultOfficer?.user), 'Demo chain: responsible officer still set', demo.mapping?.defaultOfficer?.user?.name ?? 'none');
  check(Boolean(demo.mapping?.defaultTeam), 'Demo chain: seed-sanitation-team still mapped', demo.mapping?.defaultTeam?.id ?? 'none');

  // 3. FULL matrix: every category with a department must resolve in every area
  const areas = await prisma.area.findMany({ include: { jurisdiction: true } });
  const categories = await prisma.complaintCategory.findMany();
  const routed = categories.filter((c) => c.defaultDepartmentId);
  check(areas.length >= 3, `At least 3 mapped areas exist`, `${areas.length} areas`);
  check(routed.length >= 5, `At least 5 categories map to departments`, `${routed.length} categories`);

  let gaps = 0;
  for (const area of areas) {
    for (const category of routed) {
      const m = await prisma.responsibilityMapping.findUnique({
        where: { areaId_categoryId: { areaId: area.id, categoryId: category.id } },
        include: { defaultOfficer: true, defaultTeam: true },
      });
      if (!m || !m.defaultOfficerId || !m.defaultTeamId) {
        gaps += 1;
        console.log(`FAIL  matrix gap: ${category.code} x ${area.code} -> ${m ? 'missing officer/team' : 'no mapping'}`);
      }
    }
  }
  check(gaps === 0, 'Full category x area matrix resolves (no dead ends)', `${routed.length * areas.length - gaps}/${routed.length * areas.length} cells`);

  if (problems.length) {
    console.log(`\nROUTING_DATA_INCOMPLETE: ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log('\nROUTING_DATA_OK');
}

main()
  .catch((err) => {
    console.error('verify-routing-data crashed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
