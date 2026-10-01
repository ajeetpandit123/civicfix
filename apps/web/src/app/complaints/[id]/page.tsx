'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { AuthorizedImage } from '@/components/AuthorizedImage';
import { useState } from 'react';

type Complaint = {
  id: string;
  publicId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  address: string;
  landmark?: string | null;
  department?: { name: string } | null;
  assignedTeam?: { name: string } | null;
  assignedOfficer?: { name: string } | null;
  category?: { name: string } | null;
  statusHistory: Array<{ id: string; toStatus: string; note?: string | null; createdAt: string }>;
  comments: Array<{ id: string; body: string; createdAt: string; author: { name: string } }>;
  media: Array<{ id: string; kind: string }>;
  aiAnalyses: Array<{ summary?: string | null; severity?: string | null; categoryCode?: string | null; confidence?: number | null }>;
  duplicateCandidates: Array<{ score: number; match: { publicId: string; title: string } }>;
};

export default function ComplaintDetailPage() {
  const params = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['complaint', params.id],
    enabled: Boolean(token),
    queryFn: () => apiFetch<{ complaint: Complaint }>(`/api/complaints/${params.id}`, { token: token! }),
  });
  const c = data?.complaint;

  const verify = useMutation({
    mutationFn: (resolved: boolean) =>
      apiFetch(`/api/complaints/${c!.id}/verify`, {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ resolved, reason: resolved ? undefined : 'Issue is still present' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaint', params.id] }),
  });

  const addComment = useMutation({
    mutationFn: () =>
      apiFetch(`/api/complaints/${c!.id}/comments`, {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ body: comment, visibility: 'PUBLIC' }),
      }),
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['complaint', params.id] });
    },
  });

  return (
    <AppShell>
      {isLoading ? <p>Loading…</p> : null}
      {error ? <p className="text-red-700">{(error as Error).message}</p> : null}
      {c ? (
        <article>
          <p className="text-sm text-slate-500">Complaint {c.publicId}</p>
          <h1 className="font-display text-3xl font-semibold">{c.title}</h1>
          <div className="mt-2 flex gap-2">
            <StatusBadge value={c.priority} />
            <StatusBadge value={c.status} />
          </div>
          <p className="mt-4 max-w-2xl text-slate-700">{c.description}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Location</dt>
              <dd>
                {c.address}
                {c.landmark ? ` · ${c.landmark}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Category</dt>
              <dd>{c.category?.name ?? 'Uncategorized'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Responsible department</dt>
              <dd>
                {c.department?.name ??
                  'Your complaint has been received, but the responsible authority has not yet been configured.'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Current assignment</dt>
              <dd>
                {c.assignedTeam?.name || c.assignedOfficer?.name
                  ? `${c.assignedTeam?.name ?? ''} ${c.assignedOfficer ? `· ${c.assignedOfficer.name}` : ''}`
                  : 'No individual assignment yet'}
              </dd>
            </div>
          </dl>
          {c.aiAnalyses[0] ? (
            <aside className="mt-4 rounded-xl bg-civic-50 p-4 text-sm">
              <p className="font-semibold">AI suggestion (advisory only)</p>
              <p>
                {c.aiAnalyses[0].categoryCode} · {c.aiAnalyses[0].severity} · confidence{' '}
                {Math.round((c.aiAnalyses[0].confidence ?? 0) * 100)}%
              </p>
              <p className="mt-1">{c.aiAnalyses[0].summary}</p>
            </aside>
          ) : null}
          {c.duplicateCandidates?.length ? (
            <aside className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-semibold">Possible duplicate complaints</p>
              <ul className="mt-2 list-disc pl-5">
                {c.duplicateCandidates.map((d) => (
                  <li key={d.match.publicId}>
                    {d.match.publicId} — {d.match.title} (score {d.score.toFixed(2)})
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
          <h2 className="mt-8 font-semibold">Timeline</h2>
          <ol className="mt-3 space-y-2">
            {c.statusHistory.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <StatusBadge value={h.toStatus} />
                <span className="text-slate-500">{new Date(h.createdAt).toLocaleString()}</span>
                <span>{h.note}</span>
              </li>
            ))}
          </ol>
          <h2 className="mt-8 font-semibold">Photos</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {c.media.map((m) => (
              <AuthorizedImage
                key={m.id}
                alt={m.kind}
                className="h-32 w-32 rounded-lg object-cover"
                src={`/api/complaints/${c.id}/media/${m.id}`}
              />
            ))}
            {c.media.length === 0 ? <p className="text-sm text-slate-500">No photos yet.</p> : null}
          </div>
          <h2 className="mt-8 font-semibold">Comments</h2>
          <ul className="mt-3 space-y-2">
            {c.comments.map((cm) => (
              <li key={cm.id} className="rounded-lg bg-white p-3 text-sm">
                <p className="font-medium">{cm.author.name}</p>
                <p>{cm.body}</p>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              addComment.mutate();
            }}
          >
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a public update" />
            <Button type="submit" disabled={!comment || addComment.isPending}>
              Comment
            </Button>
          </form>
          {user?.role === 'CITIZEN' && ['RESOLVED', 'CITIZEN_VERIFICATION'].includes(c.status) ? (
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold">Has this issue been resolved?</p>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => verify.mutate(true)}>Yes, resolved</Button>
                <Button variant="danger" onClick={() => verify.mutate(false)}>
                  No, still a problem
                </Button>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}
    </AppShell>
  );
}
