import { vi } from 'vitest';

/**
 * A chainable Supabase query-builder mock.
 *
 * Each builder method (.from, .select, .eq, .in, .order, .update, .insert,
 * .single, .gte, .lt, .range, .neq) returns the builder itself so calls chain.
 * The builder is also a thenable that resolves to a staged result.
 *
 * Usage:
 *   const sb = makeSupabase();
 *   sb.stage('dialog_tv_sales', { data: [...], error: null });
 *   // or stage by call order with sb.queue([...])
 *
 * The result resolved for an awaited chain is taken (in order of precedence):
 *   1. a queued result (FIFO) if any are queued
 *   2. the staged result for the table named in the last .from() call
 *   3. { data: null, error: null }
 *
 * `.single()` marks the chain so that a staged array is returned as its first
 * element (mirroring PostgREST single()).
 */
export function makeSupabase() {
  const staged = new Map(); // table -> result
  const queue = [];          // FIFO results
  const calls = [];          // record of method calls for assertions

  function makeBuilder() {
    const state = { table: null, single: false };
    const builder = {};

    const record = (method, args) => {
      calls.push({ method, args, table: state.table });
    };

    const chain = (method) => (...args) => {
      record(method, args);
      if (method === 'from') state.table = args[0];
      if (method === 'single') state.single = true;
      return builder;
    };

    for (const m of [
      'from', 'select', 'eq', 'in', 'order', 'update', 'insert',
      'gte', 'lt', 'lte', 'gt', 'range', 'neq', 'single', 'limit',
    ]) {
      builder[m] = vi.fn(chain(m));
    }

    builder.then = (resolve, reject) => {
      let result;
      if (queue.length) result = queue.shift();
      else if (state.table && staged.has(state.table)) result = staged.get(state.table);
      else result = { data: null, error: null };

      // emulate .single(): array -> first element
      if (state.single && Array.isArray(result.data)) {
        result = { ...result, data: result.data[0] ?? null };
      }
      return Promise.resolve(result).then(resolve, reject);
    };

    return builder;
  }

  const root = {
    from: vi.fn((table) => {
      const b = makeBuilder();
      return b.from(table);
    }),
    // helpers
    stage(table, result) { staged.set(table, result); return this; },
    queue(results) { queue.push(...results); return this; },
    calls,
  };

  return root;
}
