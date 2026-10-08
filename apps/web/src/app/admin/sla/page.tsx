'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function AdminSlaPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('Demo policy');
  const [priority, setPriority] = useState('HIGH');
  const [responseHours, setResponseHours] = useState(8);
  const [resolutionHours, setResolutionHours] = useState(48);
  const { data } = useQuery({
    queryKey: ['sla'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{
        policies: Array<{
          id: string;
          name: string;
          priority: string;
          responseHours: number;
          resolutionHours: number;
        }>;
      }>('/api/admin/sla-policies', { token: token! }),
  });
  const create = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/sla-policies', {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ name, priority, responseHours, resolutionHours }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla'] }),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">SLA policies</h1>
      <p className="text-sm text-slate-600">Configurable demo targets — not official government guarantees.</p>
      <form
        className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Priority</Label>
          <select className="w-full rounded-lg border px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Response hours</Label>
          <Input type="number" value={responseHours} onChange={(e) => setResponseHours(Number(e.target.value))} />
        </div>
        <div>
          <Label>Resolution hours</Label>
          <Input type="number" value={resolutionHours} onChange={(e) => setResolutionHours(Number(e.target.value))} />
        </div>
        <div className="sm:col-span-5">
          <Button type="submit">Create policy</Button>
        </div>
      </form>
      <ul className="mt-6 space-y-2">
        {data?.policies.map((p) => (
          <li key={p.id} className="rounded-lg border bg-white p-3 text-sm">
            {p.name}: {p.priority} · respond {p.responseHours}h · resolve {p.resolutionHours}h
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
