import { hashPassword } from '../src/services/authService.js';
import { prisma } from '../src/lib/prisma.js';

const DEMO_PASSWORD = 'CivicFix!demo1';

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await prisma.sequence.upsert({
    where: { name: 'complaint' },
    update: {},
    create: { name: 'complaint', value: 10300 },
  });

  const sanitation = await prisma.department.upsert({
    where: { code: 'SANITATION' },
    update: {},
    create: {
      code: 'SANITATION',
      name: 'Sanitation (demo)',
      description: 'Fictional demo department for waste and cleanliness.',
    },
  });
  const roads = await prisma.department.upsert({
    where: { code: 'ROADS' },
    update: {},
    create: { code: 'ROADS', name: 'Roads & Public Works (demo)' },
  });
  const lighting = await prisma.department.upsert({
    where: { code: 'LIGHTING' },
    update: {},
    create: { code: 'LIGHTING', name: 'Street Lighting (demo)' },
  });

  const waste = await prisma.complaintCategory.upsert({
    where: { code: 'WASTE_MANAGEMENT' },
    update: {},
    create: {
      code: 'WASTE_MANAGEMENT',
      name: 'Waste management',
      defaultDepartmentId: sanitation.id,
      subcategories: {
        create: [
          { code: 'GARBAGE_COLLECTION', name: 'Garbage collection' },
          { code: 'ILLEGAL_DUMPING', name: 'Illegal dumping' },
        ],
      },
    },
  });
  await prisma.complaintCategory.upsert({
    where: { code: 'ROADS' },
    update: {},
    create: {
      code: 'ROADS',
      name: 'Roads',
      defaultDepartmentId: roads.id,
      subcategories: { create: [{ code: 'POTHOLE', name: 'Pothole' }] },
    },
  });
  await prisma.complaintCategory.upsert({
    where: { code: 'STREETLIGHT' },
    update: {},
    create: {
      code: 'STREETLIGHT',
      name: 'Street lighting',
      defaultDepartmentId: lighting.id,
      subcategories: { create: [{ code: 'BROKEN_LIGHT', name: 'Broken streetlight' }] },
    },
  });
  await prisma.complaintCategory.upsert({
    where: { code: 'DRAINAGE' },
    update: {},
    create: {
      code: 'DRAINAGE',
      name: 'Drainage',
      subcategories: { create: [{ code: 'OVERFLOW', name: 'Overflowing drain' }] },
    },
  });
  await prisma.complaintCategory.upsert({
    where: { code: 'WATER_LEAKAGE' },
    update: {},
    create: {
      code: 'WATER_LEAKAGE',
      name: 'Water leakage',
      subcategories: { create: [{ code: 'PIPE_LEAK', name: 'Pipe leak' }] },
    },
  });
  await prisma.complaintCategory.upsert({
    where: { code: 'OTHER' },
    update: {},
    create: {
      code: 'OTHER',
      name: 'Other civic issue',
      subcategories: { create: [{ code: 'GENERAL', name: 'General' }] },
    },
  });

  const delhi = await prisma.jurisdiction.upsert({
    where: { code: 'DELHI-DEMO' },
    update: {},
    create: {
      code: 'DELHI-DEMO',
      name: 'National Capital Territory (demo / fictional)',
      description: 'Fictional sample jurisdiction for CivicFix demonstrations. Not an official government dataset.',
      isDemo: true,
    },
  });

  const adarsh = await prisma.area.upsert({
    where: { jurisdictionId_code: { jurisdictionId: delhi.id, code: 'ADARSH-NAGAR' } },
    update: {},
    create: {
      jurisdictionId: delhi.id,
      code: 'ADARSH-NAGAR',
      name: 'Adarsh Nagar (demo ward)',
      minLat: 28.70,
      maxLat: 28.74,
      minLng: 77.15,
      maxLng: 77.20,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@civicfix.demo' },
    update: { passwordHash },
    create: {
      email: 'admin@civicfix.demo',
      passwordHash,
      name: 'Demo Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const officer = await prisma.user.upsert({
    where: { email: 'officer@civicfix.demo' },
    update: { passwordHash },
    create: {
      email: 'officer@civicfix.demo',
      passwordHash,
      name: 'Priya Sharma (demo officer)',
      role: 'OFFICER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.officerProfile.upsert({
    where: { userId: officer.id },
    update: {},
    create: {
      userId: officer.id,
      departmentId: sanitation.id,
      jurisdictionId: delhi.id,
      title: 'Ward sanitation officer (fictional)',
    },
  });

  const worker = await prisma.user.upsert({
    where: { email: 'worker@civicfix.demo' },
    update: { passwordHash },
    create: {
      email: 'worker@civicfix.demo',
      passwordHash,
      name: 'Rahul Verma (demo field worker)',
      role: 'FIELD_WORKER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const team = await prisma.fieldTeam.upsert({
    where: { id: 'seed-sanitation-team' },
    update: {},
    create: {
      id: 'seed-sanitation-team',
      name: 'Adarsh Nagar sanitation crew (demo)',
      departmentId: sanitation.id,
      areaId: adarsh.id,
    },
  });
  await prisma.fieldWorkerProfile.upsert({
    where: { userId: worker.id },
    update: { teamId: team.id },
    create: { userId: worker.id, teamId: team.id },
  });

  const citizen = await prisma.user.upsert({
    where: { email: 'citizen@civicfix.demo' },
    update: { passwordHash },
    create: {
      email: 'citizen@civicfix.demo',
      passwordHash,
      name: 'Ananya Gupta (demo citizen)',
      role: 'CITIZEN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const officerProfile = await prisma.officerProfile.findUniqueOrThrow({ where: { userId: officer.id } });

  await prisma.responsibilityMapping.upsert({
    where: { areaId_categoryId: { areaId: adarsh.id, categoryId: waste.id } },
    update: {
      departmentId: sanitation.id,
      defaultOfficerId: officerProfile.id,
      defaultTeamId: team.id,
      isActive: true,
    },
    create: {
      areaId: adarsh.id,
      categoryId: waste.id,
      departmentId: sanitation.id,
      defaultOfficerId: officerProfile.id,
      defaultTeamId: team.id,
    },
  });

  const slaCount = await prisma.slaPolicy.count();
  if (slaCount === 0) {
    await prisma.slaPolicy.createMany({
      data: [
        { name: 'Waste HIGH (demo)', categoryId: waste.id, priority: 'HIGH', responseHours: 8, resolutionHours: 48 },
        { name: 'Waste MEDIUM (demo)', categoryId: waste.id, priority: 'MEDIUM', responseHours: 24, resolutionHours: 96 },
        { name: 'Default CRITICAL (demo)', priority: 'CRITICAL', responseHours: 4, resolutionHours: 24 },
      ],
    });
  }

  const existing = await prisma.complaint.findUnique({ where: { publicId: 'CF-10291' } });
  if (!existing) {
    await prisma.complaint.create({
      data: {
        publicId: 'CF-10291',
        citizenId: citizen.id,
        title: 'Garbage not collected',
        description: 'Garbage has not been collected for the last 5 days near Domino\'s in Adarsh Nagar.',
        categoryId: waste.id,
        priority: 'HIGH',
        aiSuggestedPriority: 'HIGH',
        status: 'UNDER_REVIEW',
        latitude: 28.7196,
        longitude: 77.175,
        address: 'Adarsh Nagar, Delhi, near Domino\'s (demo landmark)',
        landmark: 'Near Domino\'s (fictional demo pin)',
        areaId: adarsh.id,
        jurisdictionId: delhi.id,
        departmentId: sanitation.id,
        slaDeadline: new Date(Date.now() + 48 * 3600 * 1000),
        statusHistory: {
          create: [
            { toStatus: 'REPORTED', actorId: citizen.id, note: 'Submitted by citizen' },
            { fromStatus: 'REPORTED', toStatus: 'UNDER_REVIEW', note: 'Routed to sanitation (demo mapping)' },
          ],
        },
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: citizen.id,
        type: 'COMPLAINT_RECEIVED',
        title: 'Complaint CF-10291 received',
        body: 'Your complaint was routed to the demo sanitation department.',
      },
      {
        userId: officer.id,
        type: 'COMPLAINT_RECEIVED',
        title: 'New complaint CF-10291',
        body: 'A high-priority waste complaint entered the queue.',
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete. Demo password for all accounts:', DEMO_PASSWORD);
  console.log('Users:', admin.email, officer.email, worker.email, citizen.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
