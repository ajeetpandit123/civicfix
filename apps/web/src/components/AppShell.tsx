'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { homeForRole, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading session…</div>;
  }
  if (!user) {
    router.replace('/login');
    return null;
  }

  const links =
    user.role === 'ADMIN'
      ? [
          ['Dashboard', '/admin/dashboard'],
          ['Users', '/admin/users'],
          ['Departments', '/admin/departments'],
          ['Jurisdictions', '/admin/jurisdictions'],
          ['Routing', '/admin/responsibility'],
          ['SLA', '/admin/sla'],
        ]
      : user.role === 'OFFICER'
        ? [
            ['Queue', '/officer/dashboard'],
            ['Complaints', '/officer/complaints'],
          ]
        : user.role === 'FIELD_WORKER'
          ? [['My tasks', '/worker/dashboard']]
          : [
              ['Dashboard', '/dashboard'],
              ['New report', '/complaints/new'],
              ['Public map', '/map'],
              ['Notifications', '/notifications'],
            ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={homeForRole(user.role)} className="font-semibold tracking-tight">
            CivicFix
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={pathname === href ? 'font-semibold text-civic-700' : 'text-slate-600'}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/profile" className="hidden sm:block text-slate-600">
              {user.name}
            </Link>
            <Button
              variant="secondary"
              onClick={async () => {
                await logout();
                router.push('/');
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
