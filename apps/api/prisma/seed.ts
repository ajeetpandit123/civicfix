import { hashPassword } from '../src/services/authService.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'CivicFix!demo1';

/**
 * Development seed — idempotent (upserts everywhere) and non-destructive.
 *
 * It sets up the full data-driven routing matrix so every (category x area)
 * combination resolves to a department, a responsible officer and a crew:
 *
 *   category              -> ComplaintCategory.defaultDepartmentId
 *   (area, category)      -> ResponsibilityMapping -> department + defaultOfficer + defaultTeam
 *
 * Admins re-point any of those rows from the admin UI without code changes.
 * An incomplete matrix is exactly what leaves real complaints stuck in
 * ROUTING_PENDING with "responsible authority has not yet been configured".
 *
 * Display names follow the product copy; codes are stable identifiers (the AI
 * providers classify by category CODE, so codes must not change).
 */

type DepartmentSeed = { code: string; name: string; short: string };

const DEPARTMENTS: DepartmentSeed[] = [
  { code: 'LIGHTING', name: 'Electrical Department', short: 'ELEC' },
  { code: 'SANITATION', name: 'Sanitation / Cleaning Department', short: 'SAN' },
  { code: 'ROADS', name: 'Roads / Public Works Department', short: 'RD' },
  { code: 'DRAINAGE', name: 'Drainage Department', short: 'DRG' },
  { code: 'WATER', name: 'Water Department', short: 'WTR' },
];

type CategorySeed = { code: string; name: string; description: string; department: string | null };

const CATEGORIES: CategorySeed[] = [
  { code: 'STREETLIGHT', name: 'Street Lighting', description: 'Street lights that are out, flickering or damaged', department: 'LIGHTING' },
  { code: 'WASTE_MANAGEMENT', name: 'Garbage / Waste', description: 'Uncollected garbage, overflowing bins or illegal dumping', department: 'SANITATION' },
  { code: 'ROADS', name: 'Road Damage', description: 'Potholes, collapsed roads, broken footpaths and damaged dividers', department: 'ROADS' },
  { code: 'DRAINAGE', name: 'Drainage', description: 'Clogged drains, overflowing sewage and waterlogging', department: 'DRAINAGE' },
  { code: 'WATER_LEAKAGE', name: 'Water Supply', description: 'Water leaks, low pressure and supply interruptions', department: 'WATER' },
  { code: 'OTHER', name: 'Other civic issue', description: 'Issues outside the listed categories; routed by the admin team', department: null },
];

type AreaSeed = { code: string; name: string; minLat: number; maxLat: number; minLng: number; maxLng: number };
type JurisdictionSeed = { code: string; name: string; areas: AreaSeed[] };

const JURISDICTIONS: JurisdictionSeed[] = [
  {
    code: 'JAHANGIRPURI',
    name: 'Jahangirpuri',
    areas: [{ code: 'JAHANGIRPURI-WARD', name: 'Jahangirpuri Ward', minLat: 28.7, maxLat: 28.75, minLng: 77.05, maxLng: 77.12 }],
  },
  {
    code: 'DELHI-DEMO',
    name: 'Adarsh Nagar',
    areas: [{ code: 'ADARSH-NAGAR', name: 'Adarsh Nagar Ward', minLat: 28.7, maxLat: 28.74, minLng: 77.15, maxLng: 77.2 }],
  },
  {
    code: 'MODEL_TOWN',
    name: 'Model Town',
    areas: [{ code: 'MODEL-TOWN-WARD', name: 'Model Town Ward', minLat: 28.65, maxLat: 28.7, minLng: 77.2, maxLng: 77.26 }],
  },
];

// Fictional staff names for development. Index = departmentIndex * 3 + jurisdictionIndex,
// matching the loops above (DEPARTMENTS order x JURISDICTIONS order). Index 0 is the
// walkthrough pair from the spec: officer Priya Sharma (ELEC-204) and field worker
// Rahul Kumar (EL-1023) for Electrical / Jahangirpuri.
const OFFICER_NAMES = [
  'Priya Sharma', 'Neha Verma', 'Rajesh Gupta',
  'Arun Kapoor', 'Sunita Rao', 'Deepa Joshi',
  'Vikram Iyer', 'Pooja Bhat', 'Sanjeev Kulkarni',
  'Kavita Nair', 'Manoj Reddy', 'Anita Chopra',
  'Meena Pillai', 'Sanjay Mehta', 'Kiran Desai',
];
const WORKER_NAMES = [
  'Rahul Kumar', 'Mohan Lal', 'Sunil Tiwari',
  'Suresh Yadav', 'Rahul Verma', 'Anil Kumar',
  'Deepak Singh', 'Javed Ansari', 'Ramesh Pal',
  'Iqbal Khan', 'Prakash Jha', 'Devendra Sahu',
  'Ravi Shankar', 'Naresh Azad', 'Gopal Das',
];

const OFFICER_EMPLOYEE_IDS = ['ELEC-204', 'ELEC-201', 'ELEC-207', 'SAN-1101', 'SAN-1102', 'SAN-1103', 'RD-1201', 'RD-1202', 'RD-1203', 'DRG-1301', 'DRG-1302', 'DRG-1303', 'WTR-1401', 'WTR-1402', 'WTR-1403'];
const WORKER_EMPLOYEE_IDS = ['EL-1023', 'EL-1021', 'EL-1027', 'SAN-4410', 'SAN-4411', 'SAN-4412', 'RD-4510', 'RD-4511', 'RD-4512', 'DRG-4610', 'DRG-4611', 'DRG-4612', 'WTR-4710', 'WTR-4711', 'WTR-4712'];

const emailLocal = (prefix: string, deptCode: string, placeCode: string) =>
  `${prefix}.${deptCode.toLowerCase()}.${placeCode.toLowerCase().replace(/_/g, '-')}@civicfix.demo`;

async function main() {
  console.log('Seeding departments, categories, jurisdictions, staff and routing mappings...');
  const passwordHash = await hashPassword(demoPassword);

  // --- Departments -----------------------------------------------------
  const departments = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, isActive: true },
      create: { code: d.code, name: d.name, isActive: true },
    });
    departments.set(d.code, row.id);
  }

  // --- Categories (AI classifies to these CODES) ------------------------
  const categories = new Map<string, string>();
  for (const c of CATEGORIES) {
    const departmentId = c.department ? departments.get(c.department) ?? null : null;
    const row = await prisma.complaintCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, description: c.description, defaultDepartmentId: departmentId, isActive: true },
      create: { code: c.code, name: c.name, description: c.description, defaultDepartmentId: departmentId, isActive: true },
    });
    categories.set(c.code, row.id);
  }

  // --- Jurisdictions + mapped areas -------------------------------------
  const jurisdictions = new Map<string, string>();
  const areas = new Map<string, { id: string; jurisdictionCode: string }>();
  for (const j of JURISDICTIONS) {
    const jur = await prisma.jurisdiction.upsert({
      where: { code: j.code },
      update: { name: j.name, isActive: true },
      create: { code: j.code, name: j.name, isActive: true },
    });
    jurisdictions.set(j.code, jur.id);
    for (const a of j.areas) {
      // Areas are unique per jurisdiction (the schema has @@unique([jurisdictionId, code])).
      const area = await prisma.area.upsert({
        where: { jurisdictionId_code: { jurisdictionId: jur.id, code: a.code } },
        update: {
          name: a.name,
          jurisdictionId: jur.id,
          minLat: a.minLat,
          maxLat: a.maxLat,
          minLng: a.minLng,
          maxLng: a.maxLng,
          isActive: true,
        },
        create: {
          code: a.code,
          name: a.name,
          jurisdictionId: jur.id,
          minLat: a.minLat,
          maxLat: a.maxLat,
          minLng: a.minLng,
          maxLng: a.maxLng,
          isActive: true,
        },
      });
      areas.set(a.code, { id: area.id, jurisdictionCode: j.code });
    }
  }

  // --- Admin + demo citizen (untouched identities) ----------------------
  await prisma.user.upsert({
    where: { email: 'admin@civicfix.demo' },
    update: { name: 'Admin', passwordHash, role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email: 'admin@civicfix.demo',
      name: 'Admin',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'citizen@civicfix.demo' },
    update: { name: 'Ajeet Kr', passwordHash, role: 'CITIZEN', status: 'ACTIVE' },
    create: {
      email: 'citizen@civicfix.demo',
      name: 'Ajeet Kr',
      passwordHash,
      role: 'CITIZEN',
      status: 'ACTIVE',
    },
  });

  // --- One officer per (department x jurisdiction) ----------------------
  // so a complaint is routed to the officer who actually owns that place,
  // never to "any officer in the department".
  const officers = new Map<string, { profileId: string; userId: string }>();
  let officerIdx = 0;
  for (const d of DEPARTMENTS) {
    for (const j of JURISDICTIONS) {
      const isDemo = d.code === 'SANITATION' && j.code === 'DELHI-DEMO';
      const email = isDemo ? 'officer@civicfix.demo' : emailLocal('officer', d.code, j.code);
      const name = isDemo ? 'Sunita Rao' : OFFICER_NAMES[officerIdx] ?? `Officer ${officerIdx + 1}`;
      const employeeId = isDemo ? 'SAN-1100' : OFFICER_EMPLOYEE_IDS[officerIdx] ?? `${d.short}-1${100 + officerIdx}`;
      const user = await prisma.user.upsert({
        where: { email },
        update: { name, passwordHash, role: 'OFFICER', status: 'ACTIVE' },
        create: { email, name, passwordHash, role: 'OFFICER', status: 'ACTIVE' },
      });
      const profile = await prisma.officerProfile.upsert({
        where: { userId: user.id },
        update: {
          departmentId: departments.get(d.code)!,
          jurisdictionId: jurisdictions.get(j.code)!,
          title: `${d.name.replace(' Department', '')} Officer — ${j.name}`,
          employeeId,
          designation: 'Municipal Officer',
          organization: 'Municipal Corporation',
          officeLocation: `${j.name} Zonal Office`,
          isActive: true,
        },
        create: {
          userId: user.id,
          departmentId: departments.get(d.code)!,
          jurisdictionId: jurisdictions.get(j.code)!,
          title: `${d.name.replace(' Department', '')} Officer — ${j.name}`,
          employeeId,
          designation: 'Municipal Officer',
          organization: 'Municipal Corporation',
          officeLocation: `${j.name} Zonal Office`,
          isActive: true,
        },
      });
      officers.set(`${d.code}|${j.code}`, { profileId: profile.id, userId: user.id });
      officerIdx += 1;
    }
  }

  // --- One crew per (department x area) + its field worker --------------
  const teams = new Map<string, string>();
  let workerIdx = 0;
  for (const d of DEPARTMENTS) {
    for (const j of JURISDICTIONS) {
      for (const a of j.areas) {
        const isDemo = d.code === 'SANITATION' && a.code === 'ADARSH-NAGAR';
        // Keep the historic id referenced by the demo complaint and mapping.
        const teamId = isDemo ? 'seed-sanitation-team' : `seed-${d.code.toLowerCase()}-${a.code.toLowerCase()}`;
        const team = await prisma.fieldTeam.upsert({
          where: { id: teamId },
          update: {
            name: `${d.name.replace(' Department', '')} Crew — ${j.name}`,
            departmentId: departments.get(d.code)!,
            areaId: areas.get(a.code)!.id,
            isActive: true,
          },
          create: {
            id: teamId,
            name: `${d.name.replace(' Department', '')} Crew — ${j.name}`,
            departmentId: departments.get(d.code)!,
            areaId: areas.get(a.code)!.id,
            isActive: true,
          },
        });
        teams.set(`${d.code}|${a.code}`, team.id);

        const workerEmail = isDemo ? 'worker@civicfix.demo' : emailLocal('worker', d.code, a.code);
        const workerName = isDemo ? 'Rahul Verma' : WORKER_NAMES[workerIdx] ?? `Worker ${workerIdx + 1}`;
        const workerEmployeeId = isDemo ? 'SAN-4410' : WORKER_EMPLOYEE_IDS[workerIdx] ?? `${d.short}-4${1000 + workerIdx}`;
        const workerUser = await prisma.user.upsert({
          where: { email: workerEmail },
          update: { name: workerName, passwordHash, role: 'FIELD_WORKER', status: 'ACTIVE' },
          create: { email: workerEmail, name: workerName, passwordHash, role: 'FIELD_WORKER', status: 'ACTIVE' },
        });
        await prisma.fieldWorkerProfile.upsert({
          where: { userId: workerUser.id },
          update: {
            teamId: team.id,
            employeeId: workerEmployeeId,
            designation: 'Field Technician',
            organization: 'Municipal Corporation',
            isActive: true,
          },
          create: {
            userId: workerUser.id,
            teamId: team.id,
            employeeId: workerEmployeeId,
            designation: 'Field Technician',
            organization: 'Municipal Corporation',
            isActive: true,
          },
        });
        workerIdx += 1;
      }
    }
  }

  // --- Responsibility mappings: the admin-editable routing table --------
  let mappingCount = 0;
  for (const [code, area] of areas) {
    for (const c of CATEGORIES) {
      if (!c.department) continue;
      const officer = officers.get(`${c.department}|${area.jurisdictionCode}`);
      const teamId = teams.get(`${c.department}|${code}`);
      if (!officer || !teamId) continue;
      await prisma.responsibilityMapping.upsert({
        where: { areaId_categoryId: { areaId: area.id, categoryId: categories.get(c.code)! } },
        update: {
          departmentId: departments.get(c.department)!,
          defaultOfficerId: officer.profileId,
          defaultTeamId: teamId,
          isActive: true,
        },
        create: {
          areaId: area.id,
          categoryId: categories.get(c.code)!,
          departmentId: departments.get(c.department)!,
          defaultOfficerId: officer.profileId,
          defaultTeamId: teamId,
          isActive: true,
        },
      });
      mappingCount += 1;
    }
  }

  // --- SLA policies ----------------------------------------------------
  // Real shape (applySla looks up by isActive + priority, preferring the
  // category-specific row) and stamps responseDeadline = now + responseHours,
  // slaDeadline = now + resolutionHours. Defaults cover EVERY priority so no
  // complaint is left without a deadline; category rows override them.
  const SLA_SPECS: Array<{
    id: string;
    name: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    categoryId: string | null;
    responseHours: number;
    resolutionHours: number;
  }> = [
    { id: 'sla-default-low', name: 'Default LOW', priority: 'LOW', categoryId: null, responseHours: 48, resolutionHours: 168 },
    { id: 'sla-default-medium', name: 'Default MEDIUM', priority: 'MEDIUM', categoryId: null, responseHours: 24, resolutionHours: 96 },
    { id: 'sla-default-high', name: 'Default HIGH', priority: 'HIGH', categoryId: null, responseHours: 8, resolutionHours: 48 },
    { id: 'sla-default-critical', name: 'Default CRITICAL', priority: 'CRITICAL', categoryId: null, responseHours: 4, resolutionHours: 24 },
    { id: 'sla-waste-medium', name: 'Waste MEDIUM', priority: 'MEDIUM', categoryId: categories.get('WASTE_MANAGEMENT')!, responseHours: 24, resolutionHours: 96 },
    { id: 'sla-waste-high', name: 'Waste HIGH', priority: 'HIGH', categoryId: categories.get('WASTE_MANAGEMENT')!, responseHours: 8, resolutionHours: 48 },
  ];
  for (const s of SLA_SPECS) {
    const data = {
      name: s.name,
      priority: s.priority,
      categoryId: s.categoryId,
      responseHours: s.responseHours,
      resolutionHours: s.resolutionHours,
      isActive: true,
    };
    const match = await prisma.slaPolicy.findFirst({
      where: { categoryId: s.categoryId, priority: s.priority },
    });
    if (match) {
      await prisma.slaPolicy.update({ where: { id: match.id }, data });
    } else {
      await prisma.slaPolicy.create({ data: { id: s.id, ...data } });
    }
  }

  // --- Demo complaint (kept, so demo history does not disappear) --------
  const demoCitizen = await prisma.user.findUniqueOrThrow({ where: { email: 'citizen@civicfix.demo' } });
  const demoOfficerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'officer@civicfix.demo' } });
  const existing = await prisma.complaint.findUnique({ where: { publicId: 'CF-10291' } });
  if (existing) {
    console.log('Demo complaint CF-10291 already exists');
  } else {
    const seedTime = new Date();
    const complaint = await prisma.complaint.create({
      data: {
        publicId: 'CF-10291',
        citizenId: demoCitizen.id,
        title: 'Road collapse after water logging in low-lying block',
        description: 'The road surface collapsed after overnight water logging, creating a dangerous gap near the bus stop.',
        categoryId: categories.get('ROADS')!,
        priority: 'HIGH',
        latitude: 28.721,
        longitude: 77.171,
        address: 'Adarsh Nagar, near bus stop',
        status: 'UNDER_REVIEW',
        areaId: areas.get('ADARSH-NAGAR')!.id,
        jurisdictionId: jurisdictions.get('DELHI-DEMO')!,
        departmentId: departments.get('ROADS')!,
        assignedOfficerId: demoOfficerUser.id,
        aiAnalyses: {
          create: {
            provider: 'mock',
            model: 'mock-v1',
            inputHash: 'seed-demo-complaint',
            categoryCode: 'ROADS',
            severity: 'HIGH',
            confidence: 0.93,
            rawOutput: {
              summary: 'Road collapse and water logging blocking a bus stop near a low-lying block.',
              suggestedLabel: 'Roads',
              possibleHazards: ['Traffic hazard'],
            },
          },
        },
        assignments: {
          create: {
            assignedById: demoOfficerUser.id,
            officerId: demoOfficerUser.id,
            teamId: 'seed-sanitation-team',
            status: 'COMPLETED',
            acceptedAt: seedTime,
            completedAt: new Date(seedTime.getTime() + 6 * 60 * 60 * 1000),
            note: 'Demo: site barricaded and debris cleared',
          },
        },
      },
    });

    const historyRows: Array<[string, string, string]> = [
      ['REPORTED', 'AI_TRIAGE', 'Complaint submitted by citizen.'],
      ['AI_TRIAGE', 'UNDER_REVIEW', 'AI classified complaint as ROAD_DAMAGE.'],
      ['UNDER_REVIEW', 'UNDER_REVIEW', 'Routing completed: Sanitation / Cleaning Department, jurisdiction National Capital Territory (demo).'],
      ['UNDER_REVIEW', 'UNDER_REVIEW', 'Assignment recorded with seed-sanitation-team.'],
    ];

    for (const [from, to, note] of historyRows) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ComplaintStatusHistory" ("id", "complaintId", "actorId", "fromStatus", "toStatus", "note", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        crypto.randomUUID(),
        complaint.id,
        demoOfficerUser.id,
        from,
        to,
        note,
        seedTime,
      );
    }

    console.log('Demo complaint created', complaint.publicId);
  }

  console.log(`Seed complete. Demo password for all accounts: ${demoPassword}`);
  console.log('Departments:', DEPARTMENTS.map((d) => d.name).join(', '));
  console.log(`Responsibility mappings: ${mappingCount}`);
  console.log('Officer login for the walkthrough: officer.lighting.jahangirpuri@civicfix.demo (Priya Sharma, ELEC-204)');
  console.log('Worker login for the walkthrough: worker.lighting.jahangirpuri-ward@civicfix.demo (Rahul Kumar, EL-1023)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
