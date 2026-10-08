'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function AdminJurisdictionsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const { data } = useQuery({
    queryKey: ['jurisdictions'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ jurisdictions: Array<{ id: string; name: string; code: string; isDemo: boolean }> }>(
        '/api/admin/jurisdictions',
        { token: token! },
      ),
  });
  const create = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/jurisdictions', {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ name, code: code.toUpperCase(), isDemo: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jurisdictions'] }),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Jurisdictions</h1>
      <p className="text-sm text-slate-600">Demo records should stay labeled fictional.</p>
      <form
        className="mt-4 grid max-w-xl gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="flex items-end">
          <Button type="submit">Create</Button>
        </div>
      </form>
      <ul className="mt-6 space-y-2">
        {data?.jurisdictions.map((j) => (
          <li key={j.id} className="rounded-lg border bg-white p-3 text-sm">
            {j.name} ({j.code}) {j.isDemo ? '· demo/fictional' : ''}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
