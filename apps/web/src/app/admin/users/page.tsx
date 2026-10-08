'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

export default function AdminUsersPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin-users'],
    enabled: Boolean(token),
    queryFn: () =>
      apiFetch<{ users: Array<{ id: string; email: string; name: string; role: string; status: string }> }>(
        '/api/admin/users',
        { token: token! },
      ),
  });
  const patch = useMutation({
    mutationFn: (input: { id: string; status?: string; role?: string }) =>
      apiFetch(`/api/admin/users/${input.id}`, {
        method: 'PATCH',
        token: token!,
        body: JSON.stringify({ status: input.status, role: input.role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Users</h1>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.status}</td>
              <td>
                <Button
                  variant="secondary"
                  onClick={() =>
                    patch.mutate({ id: u.id, status: u.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' })
                  }
                >
                  {u.status === 'DISABLED' ? 'Enable' : 'Disable'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
