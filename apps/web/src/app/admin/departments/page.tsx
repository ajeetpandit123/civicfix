'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function AdminDepartmentsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const { data } = useQuery({
    queryKey: ['departments'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ departments: Array<{ id: string; name: string; code: string; isActive: boolean }> }>(
        '/api/admin/departments',
        { token: token! },
      ),
  });
  const create = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/departments', {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ name, code: code.toUpperCase() }),
      }),
    onSuccess: () => {
      setName('');
      setCode('');
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Departments</h1>
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
        {data?.departments.map((d) => (
          <li key={d.id} className="rounded-lg border bg-white p-3 text-sm">
            {d.name} ({d.code}) {d.isActive ? '' : '— inactive'}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
