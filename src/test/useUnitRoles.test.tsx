import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnitRoles } from '@/hooks/useUnitRoles';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  unit: 'unit-1',
  query: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('@/hooks/useCurrentBusinessUnit', () => ({ useCurrentBusinessUnit: () => ({ businessUnitId: mocks.unit, loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: mocks.query }) }) }) } }));

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  vi.useFakeTimers();
  mocks.user = { id: 'user-1' }; mocks.unit = 'unit-1';
  mocks.query.mockReset().mockResolvedValue({ data: [{ role: 'admin' }], error: null });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('useUnitRoles revalidation', () => {
  it('refreshes same-unit revocation at focus and fails closed on query error', async () => {
    const { result } = renderHook(() => useUnitRoles()); await flush();
    expect(result.current.roles).toEqual(['admin']);
    mocks.query.mockResolvedValue({ data: [{ role: 'attendant' }], error: null });
    act(() => window.dispatchEvent(new Event('focus'))); await flush();
    expect(result.current.roles).toEqual(['attendant']);
    mocks.query.mockResolvedValue({ data: [{ role: 'admin' }], error: { message: 'denied' } });
    act(() => window.dispatchEvent(new Event('focus'))); await flush();
    expect(result.current.roles).toEqual([]); expect(result.current.error).toBe(true);
  });

  it('revalidates once per minute in foreground and on becoming visible', async () => {
    const { result } = renderHook(() => useUnitRoles()); await flush();
    mocks.query.mockResolvedValue({ data: [], error: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.roles).toEqual([]); expect(mocks.query).toHaveBeenCalledTimes(2);
    mocks.query.mockResolvedValue({ data: [{ role: 'cashier' }], error: null });
    act(() => document.dispatchEvent(new Event('visibilitychange'))); await flush();
    expect(result.current.roles).toEqual(['cashier']);
  });

  it('does not poll while hidden and removes timers/listeners on unmount', async () => {
    const { unmount } = renderHook(() => useUnitRoles()); await flush();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    unmount(); expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('ignores an older request that resolves after a fresh revocation', async () => {
    let resolveOld!: (value: { data: { role: string }[]; error: null }) => void;
    mocks.query.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const { result } = renderHook(() => useUnitRoles());
    mocks.query.mockResolvedValue({ data: [], error: null });
    act(() => window.dispatchEvent(new Event('focus'))); await flush();
    expect(result.current.roles).toEqual([]);
    await act(async () => { resolveOld({ data: [{ role: 'admin' }], error: null }); });
    expect(result.current.roles).toEqual([]);
  });

  it('isolates unit changes and clears access on network rejection', async () => {
    const { result, rerender } = renderHook(() => useUnitRoles()); await flush();
    expect(result.current.roles).toEqual(['admin']);
    mocks.unit = 'unit-2'; mocks.query.mockRejectedValue(new Error('offline')); rerender();
    expect(result.current.roles).toEqual([]); await flush();
    expect(result.current.error).toBe(true); expect(result.current.canCashier).toBe(false);
  });
});
