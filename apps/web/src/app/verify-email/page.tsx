'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

type VerificationState = 'pending' | 'done' | 'failed' | 'missing';

function VerifyEmailForm() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<VerificationState>(token ? 'pending' : 'missing');

  useEffect(() => {
    if (!token) return;
    void apiFetch('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  }, [token]);

  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      {state === 'pending' && <p className="text-sm text-slate-600">Verifying your email…</p>}
      {state === 'done' && (
        <>
          <p className="text-lg font-semibold">Your email is verified.</p>
          <p className="text-sm text-slate-600">Sign in to report and track civic problems.</p>
        </>
      )}
      {state === 'failed' && (
        <>
          <p className="text-lg font-semibold text-red-700">This verification link is invalid or has expired.</p>
          <p className="text-sm text-slate-600">Register again to receive a fresh link.</p>
        </>
      )}
      {state === 'missing' && (
        <p className="text-sm text-red-700">
          This link is missing its token. Open the link from your verification email.
        </p>
      )}
      {state !== 'pending' && (
        <Link href="/login">
          <Button type="button">Go to sign in</Button>
        </Link>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Email verification</h1>
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  );
}
