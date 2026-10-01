'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { Input } from '@/components/ui/field';

type ListResponse = {
  total: number;
  items: Array<{
    id: string;
    publicId: string;
    title: string;
    status: string;
    priority: string;
    address: string;
    createdAt: string;
    updatedAt: string;
    category?: { name: string };
    department?: { name: string };
    assignedTeam?: { name: string } | null;
  }>;
};

export default function CitizenDashboard() {
  const { token } = useAuth();
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['complaints', q],
    enabled: Boolean(token),
    queryFn: () => apiFetch<ListResponse>(`/api/complaints?q=${encodeURIComponent(q)}`, { token: token! }),
  });

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: data?.total ?? 0,
      open: items.filter((i) => !['CLOSED', 'REJECTED'].includes(i.status)).length,
      progress: items.filter((i) => ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'].includes(i.status)).length,
      resolved: items.filter((i) => ['RESOLVED', 'CITIZEN_VERIFICATION', 'CLOSED'].includes(i.status)).length,
    };
  }, [data]);

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your complaints</h1>
          <p className="text-sm text-slate-600">Track status, assignment, and verification in one place.</p>
        </div>
        <Link href="/complaints/new" className="rounded-lg bg-civic-600 px-4 py-2 text-sm font-semibold text-white">
          New report
        </Link>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ['Total', stats.total],
          ['Open (this page)', stats.open],
          ['In progress (this page)', stats.progress],
          ['Resolved (this page)', stats.resolved],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Input placeholder="Search by ID, title, or address" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <p className="mt-6 text-sm">Loading complaints…</p> : null}
      {error ? (
        <p className="mt-6 text-sm text-red-700">
          {(error as Error).message}{' '}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      {!isLoading && data?.items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          No complaints yet. File your first report to get a tracking ID.
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {data?.items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/complaints/${c.publicId}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-civic-500"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {c.publicId} · {c.title}
                </p>
                <div className="flex gap-2">
                  <StatusBadge value={c.priority} />
                  <StatusBadge value={c.status} />
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {c.category?.name ?? 'Uncategorized'} · {c.address}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {c.department?.name
                  ? `Department: ${c.department.name}`
                  : 'Responsible authority not configured yet'}
                {c.assignedTeam ? ` · Team: ${c.assignedTeam.name}` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
