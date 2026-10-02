export interface TaskActions {
  canAccept: boolean;
  canDecline: boolean;
  canStart: boolean;
  canResume: boolean;
  /** True only once an after photo is on file — a completed task must be evidenced. */
  canComplete: boolean;
  showCompletionHint: boolean;
}

/**
 * Which actions to render for a task. Presentation only: the API enforces the
 * same rules through the status machine, so this can only hide an action the
 * server would reject, never grant one.
 */
export function taskActions(status: string, hasAfterEvidence: boolean): TaskActions {
  const inProgress = status === 'IN_PROGRESS';
  return {
    canAccept: status === 'ASSIGNED',
    canDecline: status === 'ASSIGNED',
    canStart: status === 'ACCEPTED',
    canResume: status === 'ON_HOLD',
    canComplete: inProgress && hasAfterEvidence,
    showCompletionHint: inProgress && !hasAfterEvidence,
  };
}

/** Each task carries its own note, so editing one never disturbs another. */
export function noteFor(notes: Record<string, string>, taskId: string): string {
  return notes[taskId] ?? '';
}

export function setNoteFor(
  notes: Record<string, string>,
  taskId: string,
  value: string,
): Record<string, string> {
  return { ...notes, [taskId]: value };
}

export function hasEvidence(kinds: string[] | undefined, kind: string): boolean {
  return (kinds ?? []).includes(kind);
}
