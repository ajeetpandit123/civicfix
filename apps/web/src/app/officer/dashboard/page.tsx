'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function OfficerDashboard() {
  const { token } = useAuth();
  const [status, setStatus] = useState('');
  const [sla, setSla] = useState('');
  const { data } = useQuery({
    queryKey: ['officer-complaints', status, sla],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          publicId: string;
          title: string;
          status: string;
          priority: string;
          address: string;
          slaDeadline?: string | null;
          assignedTeam?: { name: string } | null;
        }>;
      }>(
        `/api/complaints?pageSize=50${status ? `&status=${status}` : ''}${sla ? `&sla=${sla}` : ''}`,
        { token: token! },
      ),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Officer queue</h1>
      <p className="text-sm text-slate-600">Fictional demo authority workspace. Filters apply to your jurisdiction/department.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <select className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'ROUTING_PENDING', 'RESOLVED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="rounded-lg border px-3 py-2 text-sm" value={sla} onChange={(e) => setSla(e.target.value)}>
          <option value="">SLA any</option>
          <option value="approaching">Approaching</option>
          <option value="breached">Breached</option>
        </select>
      </div>
      <ul className="mt-4 space-y-3">
        {data?.items.map((c) => (
          <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex justify-between gap-2">
              <Link href={`/officer/complaints/${c.publicId}`} className="font-semibold hover:underline">
                {c.publicId} · {c.title}
              </Link>
              <div className="flex gap-2">
                <StatusBadge value={c.priority} />
                <StatusBadge value={c.status} />
              </div>
            </div>
            <p className="text-sm text-slate-600">{c.address}</p>
            <p className="text-xs text-slate-500">
              {c.assignedTeam?.name ?? 'Unassigned'}
              {c.slaDeadline ? ` · SLA ${new Date(c.slaDeadline).toLocaleString()}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
