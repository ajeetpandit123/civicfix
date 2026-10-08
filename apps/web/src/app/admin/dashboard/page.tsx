'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function AdminDashboard() {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ['analytics'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{
        total: number;
        open: number;
        resolved: number;
        reopened: number;
        duplicates: number;
        avgResolutionHours: number;
        slaCompliance: number;
        byPriority: Array<{ priority: string; _count: { _all: number } }>;
      }>('/api/admin/analytics', { token: token! }),
  });

  const chart = (data?.byPriority ?? []).map((p) => ({ name: p.priority, count: p._count._all }));

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Operations overview</h1>
      <p className="text-sm text-slate-600">Demo metrics from fictional seeded authority data.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ['Total', data?.total],
          ['Open', data?.open],
          ['Closed', data?.resolved],
          ['SLA compliance', data ? `${Math.round(data.slaCompliance * 100)}%` : '—'],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="text-2xl font-semibold">{value ?? '—'}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 h-64 rounded-xl border bg-white p-4">
        <p className="mb-2 text-sm font-semibold">Complaints by priority</p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#186352" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Reopened: {data?.reopened ?? 0} · Duplicate candidates: {data?.duplicates ?? 0} · Avg resolution hours:{' '}
        {data?.avgResolutionHours ? data.avgResolutionHours.toFixed(1) : 'n/a'}
      </p>
    </AppShell>
  );
}
