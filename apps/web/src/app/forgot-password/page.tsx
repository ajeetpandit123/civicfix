'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter your account email and we will send a link to choose a new password. The link expires in one hour.
      </p>
      <form
        className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {sent ? (
          <p className="text-sm text-slate-700">
            If that email has a CivicFix account, a reset link is on its way. In development the email is printed in the
            API console.
          </p>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
        )}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-civic-700 underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
