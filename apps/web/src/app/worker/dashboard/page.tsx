'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { hasEvidence, noteFor, setNoteFor, taskActions } from '@/lib/workerTasks';
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
  const [workDone, setWorkDone] = useState<Record<string, string>>({});
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

  /** The completion report is the only worker path to RESOLVED (after photo required). */
  const complete = useMutation({
    mutationFn: (input: { id: string; workCompleted: string; completionNotes?: string }) =>
      apiFetch(`/api/complaints/${input.id}/completion`, {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ workCompleted: input.workCompleted, completionNotes: input.completionNotes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker-tasks'] }),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">My tasks</h1>
      <p className="text-sm text-slate-600">Only complaints assigned to your field team are listed.</p>
      <ul className="mt-4 space-y-4">
        {data?.items.map((c) => {
          const note = noteFor(notes, c.id);
          const hasAfter = hasEvidence(uploads[c.id], 'AFTER');
          const status = c.status;
          const actions = taskActions(status, hasAfter);

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
                onChange={(e) => setNotes((prev) => setNoteFor(prev, c.id, e.target.value))}
                placeholder="Update notes"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {actions.canAccept && (
                  <Button onClick={() => act.mutate({ id: c.id, status: 'ACCEPTED', note })}>
                    Accept
                  </Button>
                )}
                {actions.canDecline && (
                  <Button
                    variant="secondary"
                    onClick={() => act.mutate({ id: c.id, status: 'UNDER_REVIEW', note })}
                  >
                    Decline
                  </Button>
                )}
                {actions.canStart && (
                  <Button onClick={() => act.mutate({ id: c.id, status: 'IN_PROGRESS', note })}>
                    Start work
                  </Button>
                )}
                {actions.canResume && (
                  <Button onClick={() => act.mutate({ id: c.id, status: 'IN_PROGRESS', note })}>
                    Resume
                  </Button>
                )}
                {status === 'IN_PROGRESS' && (
                  <div className="w-full space-y-2 rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold">Completion report</p>
                    <Textarea
                      value={workDone[c.id] ?? ''}
                      onChange={(e) => setWorkDone((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="What was done (required — e.g. 'Repaired the wiring and replaced the bulb')"
                    />
                    <Textarea
                      value={note}
                      onChange={(e) => setNotes((prev) => setNoteFor(prev, c.id, e.target.value))}
                      placeholder="Completion notes (optional — e.g. 'Light tested successfully')"
                    />
                    <Button
                      disabled={!actions.canComplete || (workDone[c.id] ?? '').trim().length < 10}
                      onClick={() =>
                        complete.mutate({
                          id: c.id,
                          workCompleted: workDone[c.id] ?? '',
                          completionNotes: note,
                        })
                      }
                    >
                      Submit for officer verification
                    </Button>
                    {actions.showCompletionHint ? (
                      <p className="text-xs text-amber-700">Upload an AFTER photo as proof before submitting.</p>
                    ) : null}
                  </div>
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

              {actions.showCompletionHint && (
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
