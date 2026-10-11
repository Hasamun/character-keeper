import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Character } from "./rules";
import { loadAll, saveAll } from "./storage";

interface Store {
  ready: boolean;
  characters: Character[];
  get: (id: string) => Character | undefined;
  upsert: (c: Character) => void;
  remove: (id: string) => void;
}
const Ctx = createContext<Store | null>(null);

export function CharactersProvider({ children }: { children: ReactNode }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCharacters(loadAll());
    setReady(true);
  }, []);
  const commit = useCallback((fn: (l: Character[]) => Character[]) => {
    setCharacters((prev) => {
      const next = fn(prev);
      saveAll(next);
      return next;
    });
  }, []);
  const value: Store = {
    ready,
    characters,
    get: (id) => characters.find((c) => c.id === id),
    upsert: (c) =>
      commit((l) => {
        const u = { ...c, updatedAt: new Date().toISOString() };
        return l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? u : x)) : [...l, u];
      }),
    remove: (id) => commit((l) => l.filter((x) => x.id !== id)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCharacters() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CharactersProvider missing");
  return v;
}
