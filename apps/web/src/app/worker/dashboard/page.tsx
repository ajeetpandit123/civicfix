'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type Task = {
  id: string;
  publicId: string;
  title: string;
  status: string;
  priority: string;
  address: string;
};

/** Which evidence kinds this worker has already attached per task. */
type UploadsByTask = Record<string, string[]>;

function addKind(uploads: UploadsByTask, id: string, kind: string): UploadsByTask {
  const existing = uploads[id] ?? [];
  return existing.includes(kind) ? uploads : { ...uploads, [id]: [...existing, kind] };
}

export default function WorkerDashboard() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<UploadsByTask>({});

  const { data } = useQuery({
    queryKey: ['worker-tasks'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ items: Task[] }>('/api/complaints', { token: token! }),
  });

  const act = useMutation({
    mutationFn: (input: { id: string; status: string; note?: string }) =>
      apiFetch(`/api/complaints/${input.id}/status`, {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ status: input.status, note: input.note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-tasks'] }),
  });

  const upload = useMutation({
    mutationFn: async (input: { id: string; file: File; kind: string }) => {
      const form = new FormData();
      form.append('file', input.file);
      form.append('kind', input.kind);
      return apiFetch(`/api/complaints/${input.id}/media`, { method: 'POST', token: token!, body: form });
    },
    onSuccess: (_data, input) => setUploads((prev) => addKind(prev, input.id, input.kind)),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">My tasks</h1>
      <p className="text-sm text-slate-600">Only complaints assigned to your field team are listed.</p>
      <ul className="mt-4 space-y-4">
        {data?.items.map((c) => {
          const note = notes[c.id] ?? '';
          const hasAfter = (uploads[c.id] ?? []).includes('AFTER');
          const status = c.status;

          return (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex justify-between">
                <p className="font-semibold">
                  {c.publicId} · {c.title}
                </p>
                <div className="flex gap-2">
                  <StatusBadge value={c.priority} />
                  <StatusBadge value={c.status} />
                </div>
              </div>
              <p className="text-sm text-slate-600">{c.address}</p>

              <Textarea
                className="mt-3"
                value={note}
                onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Update notes"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {status === 'ASSIGNED' && (
                  <>
                    <Button onClick={() => act.mutate({ id: c.id, status: 'ACCEPTED', note })}>
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => act.mutate({ id: c.id, status: 'UNDER_REVIEW', note })}
                    >
                      Decline
                    </Button>
                  </>
                )}
                {status === 'ACCEPTED' && (
                  <Button onClick={() => act.mutate({ id: c.id, status: 'IN_PROGRESS', note })}>
                    Start work
                  </Button>
                )}
                {status === 'ON_HOLD' && (
                  <Button onClick={() => act.mutate({ id: c.id, status: 'IN_PROGRESS', note })}>
                    Resume
                  </Button>
                )}
                {status === 'IN_PROGRESS' && (
                  <Button
                    disabled={!hasAfter}
                    onClick={() => act.mutate({ id: c.id, status: 'RESOLVED', note })}
                  >
                    Mark complete
                  </Button>
                )}

                <label className="rounded-lg border px-3 py-2 text-sm">
                  Before photo
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload.mutate({ id: c.id, file, kind: 'BEFORE' });
                    }}
                  />
                </label>
                <label className="rounded-lg border px-3 py-2 text-sm">
                  After photo
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload.mutate({ id: c.id, file, kind: 'AFTER' });
                    }}
                  />
                </label>
              </div>

              {status === 'IN_PROGRESS' && !hasAfter && (
                <p className="mt-2 text-xs text-slate-500">
                  Upload an after photo to mark this task complete.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
