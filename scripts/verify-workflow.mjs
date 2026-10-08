/**
 * CivicFix end-to-end workflow verifier (runs against a LIVE stack).
 *
 * Exercises the real HTTP workflow the product is built around:
 *   health -> categories -> register/login -> create complaint -> media upload
 *   -> comment -> assignment -> worker lifecycle -> citizen verification
 *   -> notifications -> admin endpoints -> authorization negatives.
 *
 * Usage: node scripts/verify-workflow.mjs   (API on http://localhost:4000)
 *        API_URL=http://host:port node scripts/verify-workflow.mjs
 * Exits non-zero if any step fails.
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const DEMO_PASSWORD = 'CivicFix!demo1';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* binary or empty body */
  }
  return { status: res.status, json, headers: res.headers };
}

async function login(email, password = DEMO_PASSWORD) {
  const res = await api('POST', '/api/auth/login', { body: { email, password } });
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status}`);
  return res.json.accessToken;
}

// 1x1 px PNG (magic bytes checked server-side, then re-encoded by sharp).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  // --- infrastructure ---
  const health = await api('GET', '/health');
  check('API health', health.status === 200 && health.json?.status === 'ok', `HTTP ${health.status}`);

  const cats = await api('GET', '/api/complaints/meta/categories');
  const categories = cats.json?.categories ?? [];
  check('Categories catalog (public)', cats.status === 200 && categories.length >= 3, `${categories.length} categories`);

  // --- authentication (fresh citizen + seeded demo roles) ---
  const stamp = Date.now();
  const email = `e2e-citizen-${stamp}@example.test`;
  const reg = await api('POST', '/api/auth/register', {
    body: { name: 'E2E Citizen', email, password: 'Str0ngPassword!' },
  });
  check('Register new citizen', reg.status >= 200 && reg.status < 300, `HTTP ${reg.status}`);

  let citizenToken = await login(email, 'Str0ngPassword!').catch((e) => e.message);
  check('Login as new citizen', citizenToken && !citizenToken.includes('failed'), String(citizenToken).slice(0, 24));
  const officerToken = await login('officer@civicfix.demo');
  const workerToken = await login('worker@civicfix.demo');
  const adminToken = await login('admin@civicfix.demo');
  check('Login demo officer/worker/admin', Boolean(officerToken && workerToken && adminToken));

  // --- citizen: create a report routed to the seeded Sanitation team's area ---
  // The seeded team `seed-sanitation-team` covers garbage collection in Adarsh
  // Nagar (seed.ts:172-179); assignment validates department/area match, so the
  // test complaint must route there — a "Roads" complaint elsewhere is correctly
  // refused with 422.
  const garbage = categories.find((c) => /garbage|waste|sanitation/i.test(c.name)) ?? categories[0];
  const created = await api('POST', '/api/complaints', {
    token: citizenToken,
    body: {
      title: 'E2E: garbage has not been collected on the lane',
      description: 'End-to-end verification run: the collection pile has been left for four days.',
      categoryId: garbage?.id,
      priority: 'HIGH',
      latitude: 28.7196,
      longitude: 77.175,
      address: 'Adarsh Nagar, demo ward',
    },
  });
  const complaint = created.json?.complaint;
  check('Create complaint (explicit category + priority)', created.status < 300 && Boolean(complaint?.id), `HTTP ${created.status} ${complaint?.publicId ?? ''}`);
  check('Priority respected', complaint?.priority === 'HIGH', `priority=${complaint?.priority}`);
  check('Category respected', complaint?.category?.name === garbage?.name, `category=${complaint?.category?.name ?? 'n/a'}`);
  const id = complaint?.id ?? 'missing';
  const publicId = complaint?.publicId ?? id;

  const detail = await api('GET', `/api/complaints/${publicId}`, { token: citizenToken });
  check('Citizen can read own complaint', detail.status === 200, `HTTP ${detail.status}`);
  const detailComplaint = detail.json?.complaint ?? detail.json;
  const sla = detailComplaint?.slaDeadline ?? detailComplaint?.sla?.dueAt ?? complaint?.slaDeadline ?? null;
  check('SLA deadline assigned', Boolean(sla), `slaDeadline=${sla ?? 'MISSING'}`);

  // --- media: upload + authorized read ---
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'e2e.png');
  form.append('kind', 'EVIDENCE');
  const upload = await api('POST', `/api/complaints/${publicId}/media`, { token: citizenToken, form });
  const media = upload.json?.media ?? upload.json;
  check('Media upload (PNG evidence)', upload.status < 300 && Boolean(media?.id), `HTTP ${upload.status}`);

  let mediaOk = false;
  if (media?.id) {
    const fetched = await fetch(`${BASE}/api/complaints/${publicId}/media/${media.id}`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    mediaOk = fetched.status === 200 && (fetched.headers.get('content-type') ?? '').includes('image');
    await fetched.arrayBuffer();
  }
  check('Media retrieval (authorized)', mediaOk);

  const wrongMedia = await api('GET', `/api/complaints/${publicId}/media/${media?.id ?? 'none'}`);
  check('Media requires auth', wrongMedia.status === 401 || wrongMedia.status === 403, `HTTP ${wrongMedia.status}`);

  // --- conversation ---
  const comment = await api('POST', `/api/complaints/${publicId}/comments`, {
    token: citizenToken,
    body: { body: 'E2E comment: the light is still out.', visibility: 'PUBLIC' },
  });
  check('Citizen comment', comment.status < 300, `HTTP ${comment.status}`);

  // --- officer assigns the field team that owns this department/area ---
  const teams = await api('GET', '/api/teams', { token: officerToken });
  const team = (teams.json?.teams ?? []).find((t) => t.id === 'seed-sanitation-team') ?? teams.json?.teams?.[0];
  check('Teams visible to officer', teams.status === 200 && Boolean(team), `team=${team?.id ?? 'none'}`);

  const assign = await api('POST', `/api/complaints/${publicId}/assign`, {
    token: officerToken,
    body: { teamId: team?.id, note: 'E2E: please inspect' },
  });
  check('Officer assigns team', assign.status === 200, `HTTP ${assign.status} ${JSON.stringify(assign.json?.error ?? {})}`);

  // --- field worker lifecycle: accept, start, then the completion report ---
  for (const status of ['ACCEPTED', 'IN_PROGRESS']) {
    const step = await api('POST', `/api/complaints/${publicId}/status`, {
      token: workerToken,
      body: { status, note: `E2E: ${status}` },
    });
    check(`Worker status -> ${status}`, step.status === 200, `HTTP ${step.status}`);
  }

  // Proof of work (AFTER photo) is mandatory before the report goes in.
  const proofForm = new FormData();
  proofForm.append('file', new Blob([PNG], { type: 'image/png' }), 'e2e-after.png');
  proofForm.append('kind', 'AFTER');
  const proof = await api('POST', `/api/complaints/${publicId}/media`, { token: workerToken, form: proofForm });
  check('Worker uploads AFTER proof', proof.status < 300, `HTTP ${proof.status}`);

  const completion = await api('POST', `/api/complaints/${publicId}/completion`, {
    token: workerToken,
    body: {
      workCompleted: 'E2E: repaired the fault and tested the result',
      completionNotes: 'E2E: working normally',
    },
  });
  check(
    'Worker submits completion report',
    completion.status === 200 && completion.json?.complaint?.status === 'RESOLVED',
    `HTTP ${completion.status}`,
  );

  const review = await api('POST', `/api/complaints/${publicId}/review`, {
    token: officerToken,
    body: { decision: 'APPROVE', reason: 'E2E: work checked' },
  });
  check(
    'Officer approves the report',
    review.status === 200 && review.json?.complaint?.status === 'CITIZEN_VERIFICATION',
    `HTTP ${review.status}`,
  );

  // --- citizen verifies resolution -> CLOSED ---
  const verify = await api('POST', `/api/complaints/${publicId}/verify`, {
    token: citizenToken,
    body: { resolved: true },
  });
  const afterVerify = await api('GET', `/api/complaints/${publicId}`, { token: citizenToken });
  const finalStatus = verify.json?.complaint?.status ?? (afterVerify.json?.complaint ?? afterVerify.json)?.status;
  check('Citizen verification closes complaint', verify.status === 200 && finalStatus === 'CLOSED', `status=${finalStatus}`);

  // --- notifications ---
  const notes = await api('GET', '/api/notifications', { token: citizenToken });
  check('Notifications readable', notes.status === 200 && (notes.json?.items ?? []).length >= 0, `HTTP ${notes.status} (${(notes.json?.items ?? []).length} items)`);

  // --- admin surface (paths taken from the real admin UI) ---
  for (const [name, path] of [
    ['analytics', '/api/admin/analytics'],
    ['users', '/api/admin/users'],
    ['departments', '/api/admin/departments'],
    ['teams', '/api/admin/teams'],
    ['responsibility-mappings', '/api/admin/responsibility-mappings'],
    ['sla-policies', '/api/admin/sla-policies'],
    ['audit-logs', '/api/admin/audit-logs'],
  ]) {
    const res = await api('GET', path, { token: adminToken });
    check(`Admin ${name}`, res.status === 200, `HTTP ${res.status}`);
  }

  // --- authorization negatives ---
  const citizenOnAdmin = await api('GET', '/api/admin/users', { token: citizenToken });
  check('Citizen BLOCKED from admin API', citizenOnAdmin.status === 401 || citizenOnAdmin.status === 403, `HTTP ${citizenOnAdmin.status}`);

  const workerAssigns = await api('POST', `/api/complaints/${publicId}/assign`, {
    token: workerToken,
    body: { teamId: 'seed-sanitation-team' },
  });
  check('Field worker BLOCKED from assigning', workerAssigns.status === 401 || workerAssigns.status === 403, `HTTP ${workerAssigns.status}`);

  const anonCreate = await api('POST', '/api/complaints', {
    body: { title: 'no auth', description: 'should be rejected outright', latitude: 28.6, longitude: 77.2, address: 'x y z' },
  });
  check('Anonymous BLOCKED from creating', anonCreate.status === 401 || anonCreate.status === 403, `HTTP ${anonCreate.status}`);

  // --- validation errors must name the field (regression for "Invalid request") ---
  const tooLong = await api('POST', '/api/complaints', {
    token: citizenToken,
    body: {
      title: 'x'.repeat(200),
      description: 'A description long enough to pass the minimum length check.',
      latitude: 28.72,
      longitude: 77.17,
      address: 'Adarsh Nagar, demo ward',
    },
  });
  check(
    'Over-long title rejected with field-specific message',
    tooLong.status === 422 && String(tooLong.json?.error?.message ?? '').includes('title'),
    `HTTP ${tooLong.status} msg=${String(tooLong.json?.error?.message ?? '').slice(0, 80)}`,
  );

  // --- password reset endpoint contract (token goes to console mailer in dev) ---
  const forgot = await api('POST', '/api/auth/forgot-password', { body: { email: 'citizen@civicfix.demo' } });
  check('Forgot-password accepts request', forgot.status === 200 && forgot.json?.ok === true, `HTTP ${forgot.status}`);
  const badReset = await api('POST', '/api/auth/reset-password', { body: { token: 'not-a-real-token', password: 'N3wPassword!!' } });
  check('Reset rejects invalid token', badReset.status >= 400, `HTTP ${badReset.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE}`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('workflow verifier crashed:', err);
  process.exit(1);
});
