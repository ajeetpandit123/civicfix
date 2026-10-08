'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

export default function PublicMapPage() {
  const { data } = useQuery({
    queryKey: ['public-issues'],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          publicId: string;
          status: string;
          priority: string;
          createdAt: string;
          latitude: number;
          longitude: number;
          category: { name: string } | null;
          area: { name: string } | null;
        }>;
      }>('/api/complaints/public'),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/" className="text-sm text-civic-700">
        Home
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">Public issue map (approximate)</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Coordinates are rounded. Citizen names, contact details, and internal notes are not shown.
      </p>
      <ul className="mt-6 space-y-3">
        {data?.items.map((i) => (
          <li key={i.publicId} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex justify-between gap-2">
              <p className="font-semibold">
                {i.publicId} · {i.category?.name ?? 'Issue'}
              </p>
              <StatusBadge value={i.status} />
            </div>
            <p className="text-sm text-slate-600">
              {i.area?.name ?? 'Area unpublished'} · approx {i.latitude}, {i.longitude}
            </p>
            <p className="text-xs text-slate-500">{new Date(i.createdAt).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
