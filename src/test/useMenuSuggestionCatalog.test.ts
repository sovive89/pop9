import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuSuggestionCatalog } from '@/hooks/useMenuSuggestionCatalog';
const mock = vi.hoisted(() => ({ from: vi.fn(), reads: [] as { table: string; filters: [string, unknown][]; limit: number; resolve: (value: unknown) => void }[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mock.from } }));
beforeEach(() => {
  mock.reads = [];
  mock.from.mockImplementation(table => {
    const read = { table, filters: [] as [string, unknown][], limit: 0, resolve: (_value: unknown) => {} };
    const promise = new Promise(resolve => { read.resolve = resolve; }); mock.reads.push(read);
    const builder = { select: () => builder, eq: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; }, order: () => builder, limit: (limit: number) => { read.limit = limit; return builder; }, abortSignal: () => promise };
    return builder;
  });
});
afterEach(cleanup);
const material = (name: string, unit = 'u1') => ({ id: name, name, unit: 'g', business_unit_id: unit });
async function finish(start: number, name: string, error = false) {
  await act(async () => {
    mock.reads.slice(start, start + 3).forEach(read => read.resolve({ data: read.table === 'raw_materials' ? [material(name), material('Outra unidade', 'u2')] : [], error: error ? { message: 'erro' } : null }));
  });
}
describe('unit-scoped autocomplete catalog', () => {
  it('loads only when allowed, scopes every source and filters foreign rows', async () => {
    const view = renderHook(({ enabled }) => useMenuSuggestionCatalog('u1', 'actor', enabled), { initialProps: { enabled: false } });
    expect(mock.reads).toHaveLength(0);
    view.rerender({ enabled: true });
    expect(mock.reads).toHaveLength(3);
    mock.reads.forEach(read => { expect(read.filters).toContainEqual(['business_unit_id', 'u1']); expect(read.limit).toBe(501); });
    expect(mock.reads.find(read => read.table === 'raw_materials')?.filters).toContainEqual(['active', true]);
    await finish(0, 'Tomate');
    expect(view.result.current.materials.map(row => row.name)).toEqual(['Tomate']);
    expect(view.result.current.suggestions.materials[0].value).toBe('Tomate (g)');
    view.rerender({ enabled: false }); expect(view.result.current.materials).toEqual([]);
  });
  it('discards a late answer even after leaving and returning to the same unit', async () => {
    const view = renderHook(({ unit }) => useMenuSuggestionCatalog(unit, 'actor', true), { initialProps: { unit: 'u1' } });
    view.rerender({ unit: 'u2' }); view.rerender({ unit: 'u1' });
    await finish(0, 'Resposta antiga'); expect(view.result.current.materials).toEqual([]);
    await finish(6, 'Resposta nova');
    expect(view.result.current.materials.map(row => row.name)).toEqual(['Resposta nova']);
  });
  it('clears data on actor switch and reports failure instead of showing another scope', async () => {
    const view = renderHook(({ actor }) => useMenuSuggestionCatalog('u1', actor, true), { initialProps: { actor: 'actor1' } });
    await finish(0, 'Tomate');
    view.rerender({ actor: 'actor2' }); expect(view.result.current.materials).toEqual([]);
    await finish(3, 'Falhou', true);
    expect(view.result.current.error).toBe(true); expect(view.result.current.suggestions.materials).toEqual([]);
  });
  it('caps a large catalog and reports that the source is partial', async () => {
    const view = renderHook(() => useMenuSuggestionCatalog('u1', 'actor', true));
    await act(async () => { mock.reads.forEach(read => read.resolve({ data: read.table === 'raw_materials' ? Array.from({ length: 501 }, (_, i) => material(`m${i}`)) : [], error: null })); });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.materials).toHaveLength(500); expect(view.result.current.limited).toBe(true);
  });
});
