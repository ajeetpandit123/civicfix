import { describe, expect, it } from 'vitest';
import {
  presentComplaint,
  similarityLabel,
  type LoadedComplaint,
  type PresentedComplaint,
} from '../src/services/complaintService.js';

const actor = { id: 'u1', role: 'CITIZEN', email: 'citizen@example.test' } as const;

type ShapedView = PresentedComplaint & {
  comments: Array<Record<string, unknown>>;
  aiAnalyses: Array<Record<string, unknown>>;
  duplicateCandidates: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
};

function fixture(): LoadedComplaint {
  return {
    id: 'c1',
    publicId: 'CF-1',
    title: 'Garbage uncollected for five days',
    citizenId: 'u1',
    status: 'UNDER_REVIEW',
    assignedOfficer: { id: 'o1', name: 'Officer One', role: 'OFFICER' },
    citizen: { id: 'u1', name: 'Ada', role: 'CITIZEN' },
    escalations: [{ id: 'e1', level: 'SUPERVISOR' }],
    aiAnalyses: [
      {
        id: 'a1',
        category: 'WASTE_MANAGEMENT',
        severity: 'HIGH',
        confidence: 0.94,
        summary: 'Uncollected garbage.',
        rawOutput: { internal: true },
        inputHash: 'sha256:abc',
      },
    ],
    duplicateCandidates: [
      {
        id: 'dc1',
        score: 0.82,
        reasons: ['nearby', 'same_category'],
        match: { id: 'c9', publicId: 'CF-9', title: 'Pile of garbage', status: 'UNDER_REVIEW' },
      },
    ],
    assignments: [
      {
        id: 'as-active',
        status: 'PENDING',
        officerId: 'o1',
        teamId: 't1',
        note: 'Internal: priority queue, do not tell the citizen',
        assignedById: 'admin1',
      },
      {
        id: 'as-stale',
        status: 'REASSIGNED',
        officerId: 'o2',
        teamId: 't2',
        note: 'Stale internal note',
        assignedById: 'admin1',
      },
    ],
    comments: [
      { id: 'cm1', visibility: 'PUBLIC', body: 'Crew scheduled' },
      { id: 'cm2', visibility: 'INTERNAL', body: 'Supplier is late' },
    ],
  } as unknown as LoadedComplaint;
}

describe('similarityLabel', () => {
  it('buckets scores into coarse public bands', () => {
    expect(similarityLabel(0.82)).toBe('HIGH');
    expect(similarityLabel(0.75)).toBe('HIGH');
    expect(similarityLabel(0.5)).toBe('MEDIUM');
    expect(similarityLabel(0.45)).toBe('MEDIUM');
    expect(similarityLabel(0.1)).toBe('LOW');
  });

  it('treats a missing score as LOW instead of throwing', () => {
    // This is the exact shape that crashed the detail page with toFixed.
    expect(similarityLabel(undefined)).toBe('LOW');
    expect(similarityLabel(null)).toBe('LOW');
  });
});

describe('complaint response shaping', () => {
  it('hides internal data from the reporting citizen', () => {
    const view = presentComplaint(actor, fixture()) as ShapedView;

    expect(view).not.toHaveProperty('escalations');
    expect(view.aiAnalyses[0]).not.toHaveProperty('rawOutput');
    expect(view.aiAnalyses[0]).not.toHaveProperty('inputHash');
    expect(view.aiAnalyses[0].severity).toBe('HIGH');
    expect(view.assignments[0]).not.toHaveProperty('note');
    expect(view.assignments[0]).not.toHaveProperty('assignedById');
    expect(view.duplicateCandidates[0]).not.toHaveProperty('score');
    expect(view.duplicateCandidates[0]).not.toHaveProperty('reasons');
    expect(view.duplicateCandidates[0].similarity).toBe('HIGH');
  });

  it('keeps internal data for officers', () => {
    const view = presentComplaint(
      { id: 'o1', role: 'OFFICER', email: 'officer@example.test' },
      fixture(),
    ) as ShapedView;

    expect(view.escalations).toHaveLength(1);
    expect(view.aiAnalyses[0]).toHaveProperty('rawOutput');
    expect(view.assignments[0]).toHaveProperty('note');
    expect(view.duplicateCandidates[0]).toHaveProperty('score');
    expect(view.duplicateCandidates[0]).not.toHaveProperty('similarity');
  });

  it('drops the citizen entirely for field workers', () => {
    const view = presentComplaint(
      { id: 'w1', role: 'FIELD_WORKER', email: 'worker@example.test' },
      fixture(),
    ) as Record<string, unknown>;

    expect(view).not.toHaveProperty('citizen');
    expect(view).not.toHaveProperty('escalations');
  });

  it('drops internal comments from the citizen view', () => {
    const view = presentComplaint(actor, fixture()) as ShapedView;

    expect(view.comments).toHaveLength(1);
    expect(view.comments[0].body).toBe('Crew scheduled');
  });

  it('shows only the active assignment and no officer when none is assigned', () => {
    const noActive = fixture();
    (noActive.assignments as unknown[])[0] = {
      id: 'as-active',
      status: 'REASSIGNED',
      officerId: 'o1',
      teamId: 't1',
    };
    const view = presentComplaint(actor, noActive) as Record<string, unknown>;

    expect(view.assignments).toHaveLength(0);
    expect(view.assignedOfficer).toBeNull();
  });

  it('never mutates the record the service layer still needs', () => {
    const original = fixture();
    const before = JSON.stringify(original);
    presentComplaint(actor, original);

    expect(JSON.stringify(original)).toBe(before);
  });
});
