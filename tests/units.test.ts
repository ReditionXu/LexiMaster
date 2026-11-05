import { describe, expect, it } from 'vitest';
import { makeUnit, moveUnit, activeUnits, resolveUnitRef, validateUnitName, practiceQuestions } from '../src/lib/units';
import type { Unit } from '../src/types';

const base = (): Unit[] => {
  const a = makeUnit('Unit 1', []);
  const b = makeUnit('CET-4 Vocabulary', [a]);
  const c = makeUnit('Midterm Review', [a, b]);
  a.legacyNumber = 1;
  return [a, b, c];
};

describe('units', () => {
  it('creates units with unique UUIDs and increasing order', () => {
    const u = base();
    expect(new Set(u.map((x) => x.id)).size).toBe(3);
    expect(u.map((x) => x.order)).toEqual([0, 1, 2]);
    expect(u[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('reorders without changing ids', () => {
    const u = base();
    const moved = moveUnit(u, u[2].id, -1);
    expect(activeUnits(moved).map((x) => x.name)).toEqual(['Unit 1', 'Midterm Review', 'CET-4 Vocabulary']);
    expect(moved.map((x) => x.id).sort()).toEqual(u.map((x) => x.id).sort());
  });
  it('validates names (empty, duplicate, length)', () => {
    const u = base();
    expect(validateUnitName('  ', u)).toBeTruthy();
    expect(validateUnitName('cet-4 vocabulary', u)).toBeTruthy();
    expect(validateUnitName('CET-4 Vocabulary', u, u[1].id)).toBeNull();
    expect(validateUnitName('x'.repeat(41), u)).toBeTruthy();
  });
  it('resolves import references by id, name, number and "Unit N"', () => {
    const u = base();
    expect(resolveUnitRef(u[1].id, u)?.id).toBe(u[1].id);
    expect(resolveUnitRef('midterm review', u)?.id).toBe(u[2].id);
    expect(resolveUnitRef(1, u)?.id).toBe(u[0].id);
    expect(resolveUnitRef('Unit 1', u)?.id).toBe(u[0].id);
    expect(resolveUnitRef(9, u)).toBeUndefined();
  });
  it('archived and trashed units are excluded from practice', () => {
    const u = base();
    u[1].archived = true;
    u[2].deletedAt = Date.now();
    const qs = u.map((x, i) => ({ id: `q${i}`, unitId: x.id }) as any);
    expect(practiceQuestions(qs, u).map((q) => q.id)).toEqual(['q0']);
  });
});
