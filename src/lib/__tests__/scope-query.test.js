import { describe, it, expect, vi } from 'vitest';
import { getVisibleRepIds, scopeSalesQuery } from '@/lib/scope-query';
import { makeSupabase } from './_mockSupabase';

describe('getVisibleRepIds', () => {
  it("returns '*' for admin", async () => {
    expect(await getVisibleRepIds({ id: 'a', role: 'admin' }, makeSupabase())).toBe('*');
  });
  it("returns '*' for credit_officer", async () => {
    expect(await getVisibleRepIds({ id: 'a', role: 'credit_officer' }, makeSupabase())).toBe('*');
  });
  it("returns '*' for field_officer", async () => {
    expect(await getVisibleRepIds({ id: 'a', role: 'field_officer' }, makeSupabase())).toBe('*');
  });

  it('returns [self] for a rep', async () => {
    expect(await getVisibleRepIds({ id: 'rep-1', role: 'rep' }, makeSupabase())).toEqual(['rep-1']);
  });

  it('returns [self, ...reps] for a supervisor', async () => {
    const sb = makeSupabase();
    sb.stage('profiles', { data: [{ id: 'r1' }, { id: 'r2' }], error: null });
    expect(await getVisibleRepIds({ id: 'sup-1', role: 'supervisor' }, sb)).toEqual(['sup-1', 'r1', 'r2']);
  });

  it('supervisor with no reports returns [self]', async () => {
    const sb = makeSupabase();
    sb.stage('profiles', { data: [], error: null });
    expect(await getVisibleRepIds({ id: 'sup-1', role: 'supervisor' }, sb)).toEqual(['sup-1']);
  });

  it('supervisor with null reps data (no error) returns [self]', async () => {
    const sb = makeSupabase();
    sb.stage('profiles', { data: null, error: null });
    expect(await getVisibleRepIds({ id: 'sup-1', role: 'supervisor' }, sb)).toEqual(['sup-1']);
  });

  it('manager with null supervisors data (no error) returns [self]', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: null, error: null }, // supervisors null (not an error) -> supervisorIds = []
      { data: null, error: null }, // reps null
    ]);
    expect(await getVisibleRepIds({ id: 'mgr-1', role: 'manager' }, sb)).toEqual(['mgr-1']);
  });

  it('supervisor query error falls back to [self]', async () => {
    const sb = makeSupabase();
    sb.stage('profiles', { data: null, error: { message: 'boom' } });
    expect(await getVisibleRepIds({ id: 'sup-1', role: 'supervisor' }, sb)).toEqual(['sup-1']);
  });

  it('manager returns [self, ...supervisors, ...reps]', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: [{ id: 'sup-1' }, { id: 'sup-2' }], error: null }, // supervisors
      { data: [{ id: 'r1' }, { id: 'r2' }], error: null },        // reps
    ]);
    expect(await getVisibleRepIds({ id: 'mgr-1', role: 'manager' }, sb)).toEqual([
      'mgr-1', 'sup-1', 'sup-2', 'r1', 'r2',
    ]);
  });

  it('manager with supervisor-fetch error falls back to [self]', async () => {
    const sb = makeSupabase();
    sb.queue([{ data: null, error: { message: 'boom' } }]);
    expect(await getVisibleRepIds({ id: 'mgr-1', role: 'manager' }, sb)).toEqual(['mgr-1']);
  });

  it('manager with reps-fetch error falls back to [self, ...supervisors]', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: [{ id: 'sup-1' }], error: null },                  // supervisors ok
      { data: null, error: { message: 'reps boom' } },           // reps error
    ]);
    expect(await getVisibleRepIds({ id: 'mgr-1', role: 'manager' }, sb)).toEqual(['mgr-1', 'sup-1']);
  });

  it('manager with no supervisors and null reps returns [self]', async () => {
    const sb = makeSupabase();
    sb.queue([
      { data: [], error: null },     // no supervisors
      { data: null, error: null },   // reps null
    ]);
    expect(await getVisibleRepIds({ id: 'mgr-1', role: 'manager' }, sb)).toEqual(['mgr-1']);
  });

  it('unknown role falls back to [self]', async () => {
    expect(await getVisibleRepIds({ id: 'x', role: 'whoknows' }, makeSupabase())).toEqual(['x']);
  });
});

describe('scopeSalesQuery', () => {
  it("passes the query through untouched for '*'", () => {
    const query = { in: vi.fn() };
    expect(scopeSalesQuery(query, '*')).toBe(query);
    expect(query.in).not.toHaveBeenCalled();
  });

  it('applies .in(rep_id, ids) for an array', () => {
    const returned = { tag: 'filtered' };
    const query = { in: vi.fn(() => returned) };
    const result = scopeSalesQuery(query, ['a', 'b']);
    expect(query.in).toHaveBeenCalledWith('rep_id', ['a', 'b']);
    expect(result).toBe(returned);
  });
});
