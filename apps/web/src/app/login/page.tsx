'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { homeForRole, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';

const demos = [
  ['Citizen', 'citizen@civicfix.demo'],
  ['Officer (fictional)', 'officer@civicfix.demo'],
  ['Field worker (fictional)', 'worker@civicfix.demo'],
  ['Admin', 'admin@civicfix.demo'],
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('citizen@civicfix.demo');
  const [password, setPassword] = useState('CivicFix!demo1');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Log in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Demo accounts share the password <code>CivicFix!demo1</code>. Authority identities are fictional.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            const user = await login(email, password);
            router.push(homeForRole(user.role));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
          } finally {
            setPending(false);
          }
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <ul className="mt-6 space-y-2 text-sm">
        {demos.map(([label, value]) => (
          <li key={value}>
            <button className="text-civic-700 underline" type="button" onClick={() => setEmail(value)}>
              {label}: {value}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        <Link className="font-semibold text-civic-700" href="/forgot-password">
          Forgot password?
        </Link>
      </p>
      <p className="mt-3 text-sm">
        No account?{' '}
        <Link className="font-semibold text-civic-700" href="/register">
          Register
        </Link>
      </p>
    </div>
  );
}
