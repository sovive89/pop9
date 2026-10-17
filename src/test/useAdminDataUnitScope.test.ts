import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminData } from '@/hooks/useAdminData';
const mock = vi.hoisted(() => ({ unit: 'u1', from: vi.fn(), delayed: false, finish: null as null | ((value: unknown) => void), reads: [] as { table: string; filters: [string, unknown][] }[] }));
vi.mock('@/hooks/useCurrentBusinessUnit', () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mock.unit }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mock.from } }));
const items = [{ id: 'm1', name: 'Produto U1', business_unit_id: 'u1', price: 10, category: 'c1' }, { id: 'm2', name: 'Produto U2', business_unit_id: 'u2', price: 20, category: 'c2' }];
const categories = [{ id: 'c1', key: 'c1', label: 'Categoria U1', business_unit_id: 'u1' }, { id: 'c2', key: 'c2', label: 'Categoria U2', business_unit_id: 'u2' }];
beforeEach(() => {
  mock.unit = 'u1'; mock.delayed = false; mock.finish = null; mock.reads = [];
  mock.from.mockImplementation(table => {
    const read = { table, filters: [] as [string, unknown][] }; mock.reads.push(read);
    const builder = {
      select: () => builder, order: () => builder,
      eq: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; },
      in: (key: string, value: unknown) => { read.filters.push([key, value]); return builder; },
      then: (resolve: (value: unknown) => void) => {
        if (table === 'menu_items' && mock.delayed && read.filters.some(([key, value]) => key === 'business_unit_id' && value === 'u1')) {
          mock.delayed = false; return new Promise(done => { mock.finish = done; }).then(resolve);
        }
        let data: Record<string, unknown>[] = table === 'menu_items' ? items : table === 'menu_categories' ? categories : [];
        for (const [key, value] of read.filters) data = data.filter(row => (row as Record<string, unknown>)[key] === value);
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    }; return builder;
  });
});
afterEach(cleanup);
describe('menu editor unit scope', () => {
  it('lists only current-unit products/categories and scopes children to those products', async () => {
    const view = renderHook(() => useAdminData());
    await waitFor(() => expect(view.result.current.loadingMenu).toBe(false));
    await waitFor(() => expect(view.result.current.loadingCategories).toBe(false));
    expect(view.result.current.menuItems.map(row => row.id)).toEqual(['m1']);
    expect(view.result.current.categories.map(row => row.id)).toEqual(['c1']);
    expect(mock.reads.find(read => read.table === 'menu_item_ingredients')?.filters).toContainEqual(['menu_item_id', ['m1']]);
    expect(mock.reads.find(read => read.table === 'menu_item_variants')?.filters).toContainEqual(['menu_item_id', ['m1']]);
  });
  it('does not overwrite another unit with a late menu response', async () => {
    mock.delayed = true;
    const view = renderHook(() => useAdminData());
    await waitFor(() => expect(mock.finish).not.toBeNull());
    mock.unit = 'u2'; view.rerender();
    expect(view.result.current.menuItems).toEqual([]);
    await waitFor(() => expect(view.result.current.menuItems[0]?.id).toBe('m2'));
    await act(async () => { mock.finish?.({ data: [items[0]], error: null }); });
    expect(view.result.current.menuItems.map(row => row.id)).toEqual(['m2']);
  });
});
