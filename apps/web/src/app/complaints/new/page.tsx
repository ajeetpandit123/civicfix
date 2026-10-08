'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/field';
import { LocationPicker } from '@/components/LocationPicker';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

const steps = ['Problem', 'Photo', 'Details', 'Location', 'Review', 'Done'];

// Map camera start only (New Delhi). Never sent as the complaint's location —
// the citizen must move the pin or use GPS before this wizard can continue.
const MAP_CAMERA = { latitude: 28.6139, longitude: 77.209 };

// Mirrors PRIORITIES from the shared package (the web app keeps its own constants).
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

// Field limits mirror createComplaintSchema in the shared package, so the wizard
// can never send a payload the API has to reject.
const LIMITS = {
  title: { min: 5, max: 160 },
  description: { min: 10, max: 4000 },
  landmark: { max: 200 },
  address: { min: 3, max: 500 },
} as const;

type CatalogCategory = { id: string; code: string; name: string };

export default function NewComplaintPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [landmark, setLandmark] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loc, setLoc] = useState({
    latitude: MAP_CAMERA.latitude,
    longitude: MAP_CAMERA.longitude,
    address: '',
  });
  const [locPicked, setLocPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{
    publicId: string;
    status: string;
    department?: { name: string } | null;
    jurisdiction?: { name: string } | null;
    category?: { name: string } | null;
    priority: string;
    aiAnalyses?: Array<{ summary: string | null; severity: string | null; categoryCode: string | null }>;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ categories: CatalogCategory[] }>('/api/complaints/meta/categories', { token })
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, [token]);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ complaint: typeof created & { id: string; publicId: string } }>(
        '/api/complaints',
        {
          method: 'POST',
          token: token!,
          body: JSON.stringify({
            title,
            description,
            ...(categoryId ? { categoryId } : {}),
            ...(priority ? { priority } : {}),
            ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address,
          }),
        },
      );
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', 'EVIDENCE');
        await apiFetch(`/api/complaints/${data.complaint.id}/media`, {
          method: 'POST',
          token: token!,
          body: form,
        });
      }
      setCreated(data.complaint);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setPending(false);
    }
  }

  const titleLength = title.trim().length;
  const descriptionLength = description.trim().length;
  const landmarkLength = landmark.trim().length;
  const addressLength = loc.address.trim().length;

  const titleValid = titleLength >= LIMITS.title.min && titleLength <= LIMITS.title.max;
  const descriptionValid =
    descriptionLength >= LIMITS.description.min && descriptionLength <= LIMITS.description.max;
  const landmarkValid = landmarkLength <= LIMITS.landmark.max;
  const addressValid = addressLength >= LIMITS.address.min && addressLength <= LIMITS.address.max;

  const canContinue =
    step === 0
      ? titleValid
      : step === 2
        ? descriptionValid && landmarkValid
        : step === 3
          ? locPicked && addressValid
          : true;

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Report an issue</h1>
      <ol className="mt-4 flex flex-wrap gap-2 text-xs">
        {steps.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${i === step ? 'bg-civic-700 text-white' : 'bg-white text-slate-600'}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        {step === 0 && (
          <div>
            <Label htmlFor="title">What problem are you reporting?</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {titleLength > LIMITS.title.max ? (
              <p className="mt-1 text-xs text-red-700">
                The problem line must be {LIMITS.title.max} characters or fewer (you have {titleLength}). Move the extra
                detail to the Details step.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                A short headline of {LIMITS.title.min}–{LIMITS.title.max} characters (you have {titleLength}). Put the
                full story in Details.
              </p>
            )}
          </div>
        )}
        {step === 1 && (
          <div>
            <Label htmlFor="photo">Upload a photo (optional, JPEG/PNG/WebP, 5MB)</Label>
            <Input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="desc">Describe the problem</Label>
              <Textarea id="desc" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
              {descriptionLength > LIMITS.description.max ? (
                <p className="mt-1 text-xs text-red-700">
                  Description must be {LIMITS.description.max} characters or fewer (you have {descriptionLength}).
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  At least {LIMITS.description.min} characters (you have {descriptionLength}).
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="landmark">Landmark (optional)</Label>
              <Input id="landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
              {landmarkLength > LIMITS.landmark.max ? (
                <p className="mt-1 text-xs text-red-700">
                  Landmark must be {LIMITS.landmark.max} characters or fewer (you have {landmarkLength}).
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="category">Category (optional)</Label>
              <select
                id="category"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Let CivicFix classify automatically</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="priority">Priority (optional)</Label>
              <select
                id="priority"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="">Let CivicFix assess</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Set the exact spot of the problem: move the pin, type an address, or use your location. A street address is
              required so the department can find it.
            </p>
            <LocationPicker
              latitude={loc.latitude}
              longitude={loc.longitude}
              address={loc.address}
              onChange={(next) => {
                setLoc((prev) => ({ ...prev, ...next, address: next.address ?? prev.address }));
                setLocPicked(true);
              }}
            />
            {!locPicked ? <p className="text-sm text-amber-700">Pick the location to continue.</p> : null}
            {addressLength > LIMITS.address.max ? (
              <p className="text-xs text-red-700">
                Address must be {LIMITS.address.max} characters or fewer (you have {addressLength}).
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Address: {addressLength} / {LIMITS.address.max} characters.
              </p>
            )}
          </div>
        )}
        {step === 4 && (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-semibold">Problem</dt>
              <dd>{title}</dd>
            </div>
            <div>
              <dt className="font-semibold">Details</dt>
              <dd>{description}</dd>
            </div>
            <div>
              <dt className="font-semibold">Category</dt>
              <dd>{categories.find((c) => c.id === categoryId)?.name ?? 'Automatic classification'}</dd>
            </div>
            <div>
              <dt className="font-semibold">Priority</dt>
              <dd>{priority || 'Automatic assessment'}</dd>
            </div>
            <div>
              <dt className="font-semibold">Location</dt>
              <dd>
                {loc.address} ({loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)})
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Photo</dt>
              <dd>{file ? file.name : 'None'}</dd>
            </div>
          </dl>
        )}
        {step === 5 && created && (
          <div className="space-y-2">
            <p className="text-lg font-semibold">Submitted as {created.publicId}</p>
            <p>Status: {created.status}</p>
            <p>Category: {created.category?.name ?? 'Pending classification'}</p>
            <p>Priority: {created.priority}</p>
            <p>
              Responsible department:{' '}
              {created.department?.name ??
                'Not configured yet. Your complaint was received, but the responsible authority has not yet been configured.'}
            </p>
            <p>Jurisdiction: {created.jurisdiction?.name ?? 'Unknown'}</p>
            {created.aiAnalyses?.[0] ? (
              <p className="text-sm text-slate-600">
                AI suggestion: {created.aiAnalyses[0].categoryCode} / {created.aiAnalyses[0].severity}.{' '}
                {created.aiAnalyses[0].summary}
              </p>
            ) : (
              <p className="text-sm text-slate-600">AI classification was unavailable; the complaint was still stored.</p>
            )}
            <p className="text-sm">Next: an authorized officer reviews the department queue. CivicFix will not invent a person.</p>
            <Button type="button" onClick={() => router.push(`/complaints/${created.publicId}`)}>
              View complaint
            </Button>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {step < 5 ? (
          <div className="mt-6 flex justify-between">
            <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            {step < 4 ? (
              <Button type="button" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={() => void submit()}>
                {pending ? 'Submitting…' : 'Submit complaint'}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
