import { describe, expect, it } from 'vitest';
import { hasEvidence, noteFor, setNoteFor, taskActions } from '@/lib/workerTasks';

describe('worker task actions', () => {
  it('offers Decline only while the task is ASSIGNED', () => {
    expect(taskActions('ASSIGNED', false).canDecline).toBe(true);
    expect(taskActions('ASSIGNED', true).canDecline).toBe(true);

    for (const status of ['ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'REOPENED']) {
      expect(taskActions(status, true).canDecline).toBe(false);
      expect(taskActions(status, true).canAccept).toBe(false);
    }
  });

  it('gates Mark complete behind an uploaded AFTER photo', () => {
    expect(taskActions('IN_PROGRESS', false).canComplete).toBe(false);
    expect(taskActions('IN_PROGRESS', true).canComplete).toBe(true);

    // Evidence alone must not enable completion on a task that is not in progress.
    expect(taskActions('ACCEPTED', true).canComplete).toBe(false);
    expect(taskActions('RESOLVED', true).canComplete).toBe(false);
  });

  it('explains why completion is unavailable', () => {
    expect(taskActions('IN_PROGRESS', false).showCompletionHint).toBe(true);
    expect(taskActions('IN_PROGRESS', true).showCompletionHint).toBe(false);
    expect(taskActions('ASSIGNED', false).showCompletionHint).toBe(false);
  });

  it('walks a task through accept, start and complete', () => {
    expect(taskActions('ASSIGNED', false).canAccept).toBe(true);
    expect(taskActions('ACCEPTED', false).canStart).toBe(true);
    expect(taskActions('ON_HOLD', false).canResume).toBe(true);
  });

  it('never offers an action to an unrelated role state', () => {
    expect(taskActions('ROUTING_PENDING', true)).toEqual({
      canAccept: false,
      canDecline: false,
      canStart: false,
      canResume: false,
      canComplete: false,
      showCompletionHint: false,
    });
  });
});

describe('per-task notes', () => {
  it('reads a missing note as empty', () => {
    expect(noteFor({}, 'a')).toBe('');
  });

  it('keeps each task note independent', () => {
    let notes = setNoteFor({}, 'a', 'note for a');
    notes = setNoteFor(notes, 'b', 'note for b');

    expect(noteFor(notes, 'a')).toBe('note for a');
    expect(noteFor(notes, 'b')).toBe('note for b');
  });

  it('leaves other tasks untouched when one changes', () => {
    const before = setNoteFor(setNoteFor({}, 'a', 'first'), 'b', 'second');
    const after = setNoteFor(before, 'a', 'edited');

    expect(noteFor(after, 'a')).toBe('edited');
    expect(noteFor(after, 'b')).toBe('second');
    expect(noteFor(before, 'a')).toBe('first');
  });
});

describe('evidence tracking', () => {
  it('detects a recorded kind and tolerates nothing recorded yet', () => {
    expect(hasEvidence(['BEFORE', 'AFTER'], 'AFTER')).toBe(true);
    expect(hasEvidence(['BEFORE'], 'AFTER')).toBe(false);
    expect(hasEvidence(undefined, 'AFTER')).toBe(false);
  });
});
