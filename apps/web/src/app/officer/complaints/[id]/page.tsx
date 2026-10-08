'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/ui/field';
import { AuthorizedImage } from '@/components/AuthorizedImage';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type WorkOrder = {
  id: string;
  status: string;
  teamId?: string | null;
  workerId?: string | null;
  worker?: { id: string; name: string } | null;
  workCompleted?: string | null;
  completionNotes?: string | null;
  submittedAt?: string | null;
  reviewDecision?: string | null;
  reviewNote?: string | null;
};

export default function OfficerComplaintPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [teamId, setTeamId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const { data } = useQuery({
    queryKey: ['officer-complaint', params.id],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{
        complaint: {
          id: string;
          publicId: string;
          title: string;
          description: string;
          status: string;
          priority: string;
          address: string;
          assignedTeamId?: string | null;
          assignedOfficer?: { id: string; name: string } | null;
          assignments?: WorkOrder[];
          media?: Array<{ id: string; kind: string }>;
        };
      }>(`/api/complaints/${params.id}`, { token: token! }),
  });
  const c = data?.complaint;
  const { data: teams } = useQuery({
    queryKey: ['admin-teams'],
    enabled: Boolean(token),
    queryFn: () => apiFetch<{ teams: Array<{ id: string; name: string }> }>('/api/teams', { token: token! }),
  });
  const { data: fieldWorkers } = useQuery({
    queryKey: ['field-workers'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ workers: Array<{ id: string; name: string; employeeId?: string | null; teamName?: string | null }> }>(
        '/api/field-workers',
        { token: token! },
      ),
  });

  const act = useMutation({
    mutationFn: async (op: { type: 'assign' | 'status' | 'review'; payload: unknown }) =>
      apiFetch(`/api/complaints/${c!.id}/${op.type}`, {
        method: 'POST',
        token: token!,
        body: JSON.stringify(op.payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['officer-complaint', params.id] }),
  });

  // The report to review: the latest work order with a submission on it.
  const submitted = (c?.assignments ?? []).find((a) => a.submittedAt) ?? null;

  return (
    <AppShell>
      {c ? (
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {c.publicId} · {c.title}
          </h1>
          <div className="mt-2 flex gap-2">
            <StatusBadge value={c.priority} />
            <StatusBadge value={c.status} />
          </div>
          <p className="mt-4">{c.description}</p>
          <p className="mt-2 text-sm text-slate-600">{c.address}</p>

          <div className="mt-6 space-y-3 rounded-xl border bg-white p-4">
            <p className="font-semibold">Assign field work</p>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Select a crew (optional)</option>
              {(teams?.teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
            >
              <option value="">Select a field worker (optional)</option>
              {(fieldWorkers?.workers ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.employeeId ? ` · ${w.employeeId}` : ''}
                  {w.teamName ? ` · ${w.teamName}` : ''}
                </option>
              ))}
            </select>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" />
            <Button
              disabled={!teamId && !workerId}
              onClick={() =>
                act.mutate({
                  type: 'assign',
                  payload: { teamId: teamId || undefined, workerId: workerId || undefined, note },
                })
              }
            >
              Assign
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => act.mutate({ type: 'status', payload: { status: 'UNDER_REVIEW', note } })}
              >
                Mark under review
              </Button>
            </div>
          </div>

          {submitted ? (
            <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="font-semibold">Completion report — approve or send back</p>
              <p className="text-sm">
                <span className="font-medium">Field worker:</span> {submitted.worker?.name ?? 'Unnamed'}
              </p>
              <p className="text-sm">
                <span className="font-medium">Work completed:</span> {submitted.workCompleted}
              </p>
              {submitted.completionNotes ? (
                <p className="text-sm">
                  <span className="font-medium">Notes:</span> {submitted.completionNotes}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(c.media ?? [])
                  .filter((m) => m.kind === 'BEFORE' || m.kind === 'AFTER')
                  .map((m) => (
                    <AuthorizedImage
                      key={m.id}
                      src={`/api/complaints/${c.id}/media/${m.id}`}
                      alt={`${m.kind.toLowerCase()} photo`}
                      className="h-28 rounded-lg"
                    />
                  ))}
              </div>
              <Textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Reason (required to send back)"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => act.mutate({ type: 'review', payload: { decision: 'APPROVE', reason: reviewNote || undefined } })}
                >
                  Approve (resolves for the citizen)
                </Button>
                <Button
                  variant="secondary"
                  disabled={reviewNote.trim().length < 5}
                  onClick={() => act.mutate({ type: 'review', payload: { decision: 'REJECT', reason: reviewNote } })}
                >
                  Send back to worker
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}
