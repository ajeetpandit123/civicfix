export function slaDeadline(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function hoursUntil(deadline: Date, now = new Date()): number {
  return (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export type SlaState = 'OK' | 'APPROACHING' | 'BREACHED';

export function slaState(deadline: Date | null | undefined, now = new Date()): SlaState {
  if (!deadline) return 'OK';
  const hours = hoursUntil(deadline, now);
  if (hours < 0) return 'BREACHED';
  if (hours <= 24) return 'APPROACHING';
  return 'OK';
}
