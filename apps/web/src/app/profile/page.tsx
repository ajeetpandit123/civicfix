'use client';

import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold">Profile</h1>
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Name</dt>
          <dd>{user?.name}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd>{user?.email}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Role</dt>
          <dd>{user?.role}</dd>
        </div>
      </dl>
    </AppShell>
  );
}
