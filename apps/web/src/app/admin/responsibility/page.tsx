'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function ResponsibilityPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['mappings'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{
        mappings: Array<{
          id: string;
          area: { name: string };
          category: { name: string };
          department: { name: string };
          isActive: boolean;
        }>;
      }>('/api/admin/responsibility-mappings', { token: token! }),
  });
  const areas = useQuery({
    queryKey: ['admin-areas'],
    enabled: Boolean(token),
    queryFn: () => apiFetch<{ areas: Array<{ id: string; name: string }> }>('/api/admin/areas', { token: token! }),
  });
  const cats = useQuery({
    queryKey: ['admin-cats'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ categories: Array<{ id: string; name: string }> }>('/api/admin/categories', { token: token! }),
  });
  const deps = useQuery({
    queryKey: ['admin-deps'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ departments: Array<{ id: string; name: string }> }>('/api/admin/departments', { token: token! }),
  });
  const [areaId, setAreaId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const create = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/responsibility-mappings', {
        method: 'POST',
        token: token!,
        body: JSON.stringify({ areaId, categoryId, departmentId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mappings'] }),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Responsibility mappings</h1>
      <p className="text-sm text-slate-600">
        Area + category → department. CivicFix never invents a responsible person.
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <select className="rounded-lg border px-3 py-2 text-sm" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">Area</option>
          {areas.data?.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="rounded-lg border px-3 py-2 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Category</option>
          {cats.data?.categories.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="rounded-lg border px-3 py-2 text-sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">Department</option>
          {deps.data?.departments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button type="submit">Save mapping</Button>
      </form>
      <ul className="mt-6 space-y-2">
        {data?.mappings.map((m) => (
          <li key={m.id} className="rounded-lg border bg-white p-3 text-sm">
            {m.area.name} + {m.category.name} → {m.department.name} {m.isActive ? '' : '(inactive)'}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
