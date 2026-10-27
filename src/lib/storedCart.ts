// Sacola do cardápio público guardada no aparelho (localStorage) por 7 dias.
// Só id e quantidade: a observação do pedido (texto livre, pode ter dado pessoal) e o preço (o servidor recalcula) não são guardados.
export const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_QTY = 20;
const KEY_RE = /^(item|combo):[^\s:]{1,80}$/;
export type CartLines = Record<string, number>;
type Options = { now?: number; storage?: Storage | null };

const storageKey = (unit: string) => `pop9:cart:${unit}`;
function defaultStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }

/** Mantém só chaves válidas (e presentes no cardápio atual, se informado) com quantidade inteira de 1 a 20. */
export function sanitizeCart(raw: unknown, validKeys?: ReadonlySet<string>): CartLines {
  const clean: CartLines = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const [key, value] of Object.entries(raw)) {
    if (!KEY_RE.test(key) || (validKeys && !validKeys.has(key))) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) continue;
    clean[key] = Math.min(MAX_QTY, value);
  }
  return clean;
}

export function loadCart(unit: string, options: Options & { validKeys?: ReadonlySet<string> } = {}): CartLines {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return {};
  try {
    const raw = storage.getItem(storageKey(unit));
    if (!raw) return {};
    const saved = JSON.parse(raw) as { v?: number; savedAt?: unknown; cart?: unknown } | null;
    const age = (options.now ?? Date.now()) - Number(saved?.savedAt);
    // Vence em 7 dias; relógio do aparelho muito adiantado (data no futuro) também invalida.
    if (saved?.v !== 1 || !Number.isFinite(age) || age > CART_TTL_MS || age < -FUTURE_SKEW_MS) { storage.removeItem(storageKey(unit)); return {}; }
    return sanitizeCart(saved.cart, options.validKeys);
  } catch {
    try { storage.removeItem(storageKey(unit)); } catch { /* armazenamento indisponível */ }
    return {};
  }
}

export function saveCart(unit: string, cart: CartLines, options: Options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return;
  try {
    const lines = sanitizeCart(cart);
    if (!Object.keys(lines).length) { storage.removeItem(storageKey(unit)); return; }
    storage.setItem(storageKey(unit), JSON.stringify({ v: 1, savedAt: options.now ?? Date.now(), cart: lines }));
  } catch { /* cota cheia ou armazenamento bloqueado: a sacola segue só na memória */ }
}

export function clearCart(unit: string, storage: Storage | null = defaultStorage()) {
  try { storage?.removeItem(storageKey(unit)); } catch { /* idem */ }
}
