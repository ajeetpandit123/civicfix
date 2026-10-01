import { cn, formatStatus } from '@/lib/cn';

const tones: Record<string, string> = {
  REPORTED: 'bg-slate-100 text-slate-800',
  ROUTING_PENDING: 'bg-amber-100 text-amber-900',
  UNDER_REVIEW: 'bg-sky-100 text-sky-900',
  ASSIGNED: 'bg-indigo-100 text-indigo-900',
  ACCEPTED: 'bg-teal-100 text-teal-900',
  IN_PROGRESS: 'bg-blue-100 text-blue-900',
  ON_HOLD: 'bg-orange-100 text-orange-900',
  RESOLVED: 'bg-emerald-100 text-emerald-900',
  CITIZEN_VERIFICATION: 'bg-violet-100 text-violet-900',
  CLOSED: 'bg-civic-100 text-civic-700',
  REJECTED: 'bg-red-100 text-red-800',
  REOPENED: 'bg-rose-100 text-rose-900',
  LOW: 'bg-slate-100 text-slate-700',
  MEDIUM: 'bg-yellow-100 text-yellow-900',
  HIGH: 'bg-orange-100 text-orange-900',
  CRITICAL: 'bg-red-100 text-red-800',
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
        tones[value] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {formatStatus(value)}
    </span>
  );
}
