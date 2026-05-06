import { describe, it, expect } from 'vitest';
import { mmKeys } from '../keys.js';

describe('mmKeys — X4 hierarchy pattern', () => {
  it('sessions.all() is root key for invalidation', () => {
    expect(mmKeys.sessions.all()).toEqual(['sessions']);
  });

  it('sessions.byId(id) is scoped under all()', () => {
    const id = 'abc-123';
    expect(mmKeys.sessions.byId(id)).toEqual(['sessions', id]);
    expect(mmKeys.sessions.byId(id)[0]).toBe(mmKeys.sessions.all()[0]);
  });

  it('sessions.state(id) is scoped under byId(id)', () => {
    const id = 'abc-123';
    expect(mmKeys.sessions.state(id)).toEqual(['sessions', id, 'state']);
  });

  it('sessions.summary(id) is scoped under byId(id)', () => {
    const id = 'abc-123';
    expect(mmKeys.sessions.summary(id)).toEqual(['sessions', id, 'summary']);
  });

  it('sessions.recent() is scoped under all() (Stage 22 / Q-22.1)', () => {
    expect(mmKeys.sessions.recent()).toEqual(['sessions', 'recent']);
    expect(mmKeys.sessions.recent()[0]).toBe(mmKeys.sessions.all()[0]);
  });

  it('users.all() is root key', () => {
    expect(mmKeys.users.all()).toEqual(['users']);
  });

  it('users.me() is stable singleton key', () => {
    expect(mmKeys.users.me()).toEqual(['users', 'me']);
    expect(mmKeys.users.me()).toEqual(mmKeys.users.me());
  });

  it('intelligence.learningDNA(studentId) includes studentId', () => {
    expect(mmKeys.intelligence.learningDNA('stu-1')).toEqual([
      'intelligence',
      'learningDNA',
      'stu-1',
    ]);
  });

  it('orchestration.pathwayReadiness(slug) includes slug', () => {
    expect(mmKeys.orchestration.pathwayReadiness('naplan-y5')).toEqual([
      'orchestration',
      'pathwayReadiness',
      'naplan-y5',
    ]);
  });

  it('different domains produce different root keys', () => {
    const roots = [
      mmKeys.users.all()[0],
      mmKeys.sessions.all()[0],
      mmKeys.intelligence.all()[0],
      mmKeys.orchestration.all()[0],
      mmKeys.pathways.all()[0],
    ];
    expect(new Set(roots).size).toBe(roots.length);
  });
});
