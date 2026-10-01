'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

export default function NotificationsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ items: Array<{ id: string; title: string; body: string; readAt: string | null; createdAt: string }> }>(
        '/api/notifications',
        { token: token! },
      ),
  });
  const read = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'POST', token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Notifications</h1>
      <ul className="mt-4 space-y-3">
        {data?.items.map((n) => (
          <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold">{n.title}</p>
            <p className="text-sm text-slate-600">{n.body}</p>
            {!n.readAt ? (
              <button className="mt-2 text-sm text-civic-700 underline" onClick={() => read.mutate(n.id)}>
                Mark read
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
