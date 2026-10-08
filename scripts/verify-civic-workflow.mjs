/**
 * MANDATORY end-to-end civic workflow (the exact 18-step scenario).
 *
 *   Citizen -> AI -> Category -> Department -> Jurisdiction -> Officer ->
 *   Field Worker -> Completion report + proof -> Officer approval ->
 *   Resolved -> Citizen notification -> Resolution email
 *
 * Runs against the real HTTP API (set API_URL to aim at another origin).
 * Usage: node scripts/verify-civic-workflow.mjs
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient();
const results = [];
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function check(ok, label, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, { token, body, form } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function login(email) {
  const res = await api('POST', '/api/auth/login', { body: { email, password: 'CivicFix!demo1' } });
  check(res.status === 200, `Login as ${email}`, `HTTP ${res.status}`);
  return res.json?.accessToken;
}

async function main() {
  const department = await prisma.department.findFirstOrThrow({ where: { code: 'LIGHTING' } });
  const rahul = await prisma.user.findUniqueOrThrow({ where: { email: 'worker.lighting.jahangirpuri-ward@civicfix.demo' } });

  // 1. Citizen logs in.
  const citizenToken = await login('citizen@civicfix.demo');

  // 2. Citizen reports: "Street light is not working in Jahangirpuri."
  const created = await api('POST', '/api/complaints', {
    token: citizenToken,
    body: {
      title: 'Street light is not working in Jahangirpuri.',
      description: 'The street light near the park gate has been out for three nights and the path is unsafe at night.',
      latitude: 28.72,
      longitude: 77.1,
      address: 'Jahangirpuri Ward, near the park gate',
    },
  });
  check(created.status === 201, '2. Citizen reports "Street light is not working in Jahangirpuri."', `HTTP ${created.status}`);
  const c = created.json?.complaint;
  const publicId = c?.publicId;
  const complaintId = c?.id;
  check(Boolean(publicId), '   complaint created', `publicId=${publicId}`);

  // 3. AI detects the category.
  check(c?.category?.code === 'STREETLIGHT', '3. AI detects: Street Lighting', `code=${c?.category?.code}`);
  check((c?.aiAnalyses?.[0]?.confidence ?? 0) > 0, '   AI classification recorded', `confidence=${c?.aiAnalyses?.[0]?.confidence}`);

  // 4. Category -> department.
  check(c?.department?.name === department.name, '4. Street Lighting -> Electrical Department', c?.department?.name);

  // 5. Location -> jurisdiction.
  check(c?.jurisdiction?.name === 'Jahangirpuri', '5. Location -> Jahangirpuri jurisdiction', c?.jurisdiction?.name);

  // 6. Department + jurisdiction -> responsible officer.
  check(c?.assignedOfficer?.name === 'Priya Sharma', '6. Responsible officer: Priya Sharma (ELEC-204)', c?.assignedOfficer?.name);
  check(c?.status !== 'ROUTING_PENDING', '   routed — not stuck in Routing Pending', c?.status);

  // 7. The complaint appears in that officer's queue.
  const officerToken = await login('officer.lighting.jahangirpuri@civicfix.demo');
  const queue = await api('GET', '/api/complaints', { token: officerToken });
  check(
    queue.status === 200 && queue.json.items.some((i) => i.publicId === publicId),
    '7. Complaint appears in the responsible officer dashboard',
    `HTTP ${queue.status}`,
  );

  // 8. Officer opens the complaint and sees what handling needs.
  const opened = await api('GET', `/api/complaints/${publicId}`, { token: officerToken });
  const seen = opened.json?.complaint;
  check(opened.status === 200, '8. Officer opens the complaint', `HTTP ${opened.status}`);
  check(
    Boolean(seen?.category && seen?.priority && seen?.address && seen?.citizen && seen?.aiAnalyses?.length),
    '   officer sees category, priority, location, citizen, AI analysis',
  );
  check(Boolean(seen?.slaDeadline), '   SLA deadline visible', String(seen?.slaDeadline ?? '').slice(0, 10));

  // 9. Officer assigns the electrical field worker (Rahul Kumar, EL-1023).
  const assigned = await api('POST', `/api/complaints/${publicId}/assign`, {
    token: officerToken,
    body: { workerId: rahul.id, note: 'Please fix the street light.' },
  });
  check(assigned.status === 200, '9. Officer assigns field worker Rahul Kumar (EL-1023)', `HTTP ${assigned.status}`);

  // 10. The field worker receives the assignment.
  const workerToken = await login('worker.lighting.jahangirpuri-ward@civicfix.demo');
  const myWork = await api('GET', '/api/complaints', { token: workerToken });
  check(
    myWork.status === 200 && myWork.json.items.some((i) => i.publicId === publicId),
    '10. Field worker receives the assignment',
    `HTTP ${myWork.status}`,
  );

  // 11. Worker accepts and starts work.
  for (const status of ['ACCEPTED', 'IN_PROGRESS']) {
    const step = await api('POST', `/api/complaints/${publicId}/status`, { token: workerToken, body: { status } });
    check(step.status === 200, `11. Field worker ${status.toLowerCase().replace('_', ' ')} the task`, `HTTP ${step.status}`);
  }

  // 13. Field worker uploads completion evidence (proof is mandatory first).
  const proof = new FormData();
  proof.append('file', new Blob([PNG], { type: 'image/png' }), 'streetlight-fixed.png');
  proof.append('kind', 'AFTER');
  const uploaded = await api('POST', `/api/complaints/${publicId}/media`, { token: workerToken, form: proof });
  check(uploaded.status < 300, '13. Field worker uploads completion evidence (AFTER photo)', `HTTP ${uploaded.status}`);

  // 12. Field worker submits the completion report (-> pending officer verification).
  const completion = await api('POST', `/api/complaints/${publicId}/completion`, {
    token: workerToken,
    body: {
      workCompleted: 'Street light wiring was repaired and the damaged bulb was replaced.',
      completionNotes: 'Light tested successfully.',
    },
  });
  check(
    completion.status === 200 && completion.json?.complaint?.status === 'RESOLVED',
    '12. Field worker submits completion report (Pending Officer Verification)',
    `HTTP ${completion.status} status=${completion.json?.complaint?.status}`,
  );

  // 14. Officer receives the completion report with the evidence.
  const review = await api('GET', `/api/complaints/${publicId}`, { token: officerToken });
  const report = review.json?.complaint?.assignments?.find((a) => a.submittedAt);
  check(Boolean(report?.workCompleted?.includes('repaired')), '14. Officer receives the completion report', report?.workCompleted?.slice(0, 40));
  check(Boolean(report?.completionNotes), '   completion notes visible', report?.completionNotes);
  check(
    (review.json?.complaint?.media ?? []).some((m) => m.kind === 'AFTER'),
    '   after photo visible to the officer',
  );

  // 15. Officer approves.
  const approved = await api('POST', `/api/complaints/${publicId}/review`, {
    token: officerToken,
    body: { decision: 'APPROVE', reason: 'Work checked on site.' },
  });
  check(
    approved.status === 200 && approved.json?.complaint?.status === 'CITIZEN_VERIFICATION',
    '15. Officer approves the work',
    `HTTP ${approved.status} status=${approved.json?.complaint?.status}`,
  );
  check(
    (review.json?.complaint?.assignments ?? []).every((a) => a.reviewDecision !== 'REJECTED'),
    '   no rejected verdict left behind',
  );

  // 16. Complaint is resolved (approved -> citizen verification), verdict stamped.
  const stamped = await prisma.complaintAssignment.findFirst({
    where: { complaintId, workerId: rahul.id },
    orderBy: { createdAt: 'desc' },
  });
  check(stamped?.reviewDecision === 'APPROVED', '16. Complaint Resolved — officer verdict recorded', stamped?.reviewDecision);

  // 17. Citizen sees the updated status and resolves it.
  const citizenView = await api('GET', `/api/complaints/${publicId}`, { token: citizenToken });
  check(
    citizenView.status === 200 && citizenView.json?.complaint?.status === 'CITIZEN_VERIFICATION',
    '17. Citizen sees the updated status',
    citizenView.json?.complaint?.status,
  );
  const verified = await api('POST', `/api/complaints/${publicId}/verify`, {
    token: citizenToken,
    body: { resolved: true, reason: 'Light is working again.' },
  });
  check(verified.status === 200 && verified.json?.complaint?.status === 'CLOSED', '   citizen confirms -> CLOSED', verified.json?.complaint?.status);

  // 18. Resolution email generated and sent (exactly once, audited).
  const mails = await prisma.auditLog.findMany({ where: { action: 'complaint.resolution_email_sent', entityId: complaintId } });
  check(mails.length === 1, '18. Resolution email generated and sent (exactly once)', `${mails.length} send(s)`);
  check(
    (mails[0]?.metadata ?? {}).to === 'citizen@civicfix.demo',
    '   addressed to the citizen on record',
    (mails[0]?.metadata ?? {}).to,
  );
  const notify = await prisma.notification.findFirst({ where: { complaintId, type: 'VERIFICATION_REQUIRED' } });
  check(Boolean(notify), '   citizen notified to verify');

  await prisma.$disconnect();

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} steps passed against ${BASE}`);
  if (passed !== results.length) process.exit(1);
  console.log('CIVIC_WORKFLOW_OK');
}

main().catch((err) => {
  console.error('verify-civic-workflow crashed:', err.message);
  process.exit(1);
});
