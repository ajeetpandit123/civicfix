'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function OfficerComplaintPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
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
        };
      }>(`/api/complaints/${params.id}`, { token: token! }),
  });
  const c = data?.complaint;
  const { data: teams } = useQuery({
    queryKey: ['admin-teams'],
    enabled: Boolean(token),
    queryFn: () => apiFetch<{ teams: Array<{ id: string; name: string }> }>('/api/teams', { token: token! }),
  });

  const act = useMutation({
    mutationFn: async (op: { type: 'assign' | 'status'; payload: unknown }) => {
      const path = op.type === 'assign' ? 'assign' : 'status';
      return apiFetch(`/api/complaints/${c!.id}/${path}`, {
        method: 'POST',
        token: token!,
        body: JSON.stringify(op.payload),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['officer-complaint', params.id] }),
  });

  const [teamId, setTeamId] = useState('');

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
            <p className="font-semibold">Assign field team</p>
            <select className="rounded-lg border px-3 py-2 text-sm" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Select a demo team</option>
              {(teams?.teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" />
            <Button
              disabled={!teamId}
              onClick={() => act.mutate({ type: 'assign', payload: { teamId, note } })}
            >
              Assign
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => act.mutate({ type: 'status', payload: { status: 'UNDER_REVIEW', note } })}>
                Mark under review
              </Button>
              <Button variant="secondary" onClick={() => act.mutate({ type: 'status', payload: { status: 'CITIZEN_VERIFICATION', note } })}>
                Send for citizen verification
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
