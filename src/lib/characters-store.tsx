import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Character } from "./rules";
import { clearLocal, loadAll, normalizeCharacter } from "./storage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Store {
  ready: boolean;
  characters: Character[];
  get: (id: string) => Character | undefined;
  upsert: (c: Character) => void;
  remove: (id: string) => void;
}
const Ctx = createContext<Store | null>(null);

const toRow = (c: Character, ownerId: string) => ({
  id: c.id, owner_id: ownerId, name: c.name, data: c as unknown as Json, updated_at: c.updatedAt,
});

export function CharactersProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ready, setReady] = useState(false);
  const [localHeroes, setLocalHeroes] = useState<Character[]>([]);
  const [migrating, setMigrating] = useState(false);
  // Serialize writes per character so a slow request never overwrites a newer one.
  const queue = useRef<Map<string, Promise<unknown>>>(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("characters").select("data").order("created_at");
      if (!alive) return;
      if (error) toast.error("Не удалось загрузить героев");
      setCharacters((data ?? []).flatMap((r) => { try { return [normalizeCharacter(r.data)]; } catch { return []; } }));
      setReady(true);
      setLocalHeroes(loadAll());
    })();
    return () => { alive = false; };
  }, [userId]);

  const persist = useCallback((c: Character) => {
    const prev = queue.current.get(c.id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const { error } = await supabase.from("characters").upsert(toRow(c, userId));
      if (error) toast.error("Не удалось сохранить изменения");
    });
    queue.current.set(c.id, next);
  }, [userId]);

  const migrate = async () => {
    setMigrating(true);
    const existing = new Set(characters.map((c) => c.id));
    const rows = localHeroes.map((c) => toRow(existing.has(c.id) ? { ...c, id: crypto.randomUUID() } : c, userId));
    const { error } = await supabase.from("characters").insert(rows);
    setMigrating(false);
    if (error) { toast.error("Перенос не удался, герои остались в браузере"); return; }
    clearLocal();
    setCharacters((l) => [...l, ...rows.map((r) => normalizeCharacter(r.data))]);
    setLocalHeroes([]);
    toast.success(`Перенесено героев: ${rows.length}`);
  };

  const value: Store = {
    ready,
    characters,
    get: (id) => characters.find((c) => c.id === id),
    upsert: (c) => {
      const u = { ...c, updatedAt: new Date().toISOString() };
      setCharacters((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? u : x)) : [...l, u]));
      persist(u);
    },
    remove: (id) => {
      setCharacters((l) => l.filter((x) => x.id !== id));
      void supabase.from("characters").delete().eq("id", id).then(({ error }) => { if (error) toast.error("Не удалось удалить"); });
    },
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <AlertDialog open={ready && localHeroes.length > 0}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Найдены герои в этом браузере</AlertDialogTitle>
            <AlertDialogDescription>
              {localHeroes.map((h) => h.name).join(", ")}. Перенести их в ваш аккаунт? Тогда они будут доступны на любом устройстве.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLocalHeroes([])}>Позже</AlertDialogCancel>
            <AlertDialogAction disabled={migrating} onClick={(e) => { e.preventDefault(); void migrate(); }}>
              {migrating ? "Переносим…" : "Перенести"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}

export function useCharacters() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CharactersProvider missing");
  return v;
}
