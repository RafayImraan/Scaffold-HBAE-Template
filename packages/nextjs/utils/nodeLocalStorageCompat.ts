/**
 * Node 23+ defines a `localStorage` global even when no storage file is configured,
 * and it can arrive without `getItem`/`setItem`. RainbowKit reads `localStorage.getItem`
 * during SSR/prerender whenever the global exists at all, which fails `next build`.
 * On the server, swap a non-functional global for an in-memory Storage.
 */
export function normalizeNodeLocalStorage(): void {
  if (typeof window !== "undefined") return;

  const storage = (globalThis as { localStorage?: Partial<Storage> }).localStorage;
  if (!storage || typeof storage.getItem === "function") return;

  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, String(value)),
      removeItem: (key: string) => memory.delete(key),
      clear: () => memory.clear(),
      key: (index: number) => Array.from(memory.keys())[index] ?? null,
      get length() {
        return memory.size;
      },
    },
  });
}
