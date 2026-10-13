import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountQuery } from "./catalog-queries";
import { saveOwnedCharacter } from './sharing.functions';
import { useServerFn } from '@tanstack/react-start';
import { clearItemImageCache } from "./item-images";
import { Button } from "@/components/ui/button";
import { AccountBar } from "@/components/AccountBar";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { reconcileEffects } from "./rules/derived";
import type { Character } from "./rules";
import { clearLocal, loadAll, normalizeCharacter } from "./storage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Store {
  refresh: () => Promise<void>;
  ready: boolean;
  characters: Character[];
  get: (id: string) => Character | undefined;
  upsert: (c: Character) => Promise<void>;
  remove: (id: string) => void;
}
const Ctx = createContext<Store | null>(null);

const toRow = (c: Character, ownerId: string) => ({
  id: c.id, owner_id: ownerId, name: c.name, data: c as unknown as Json, updated_at: c.updatedAt,
});

export function CharactersProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const saveOwned = useServerFn(saveOwnedCharacter);
  const access = useQuery({ ...accountQuery(), refetchInterval: 15000, refetchIntervalInBackground: true });
  const allowed = access.data?.active === true;
  const [characters, setCharacters] = useState<Character[]>([]);
  const [ready, setReady] = useState(false);
  const [localHeroes, setLocalHeroes] = useState<Character[]>([]);
  const [migrating, setMigrating] = useState(false);
  // Serialize writes per character so a slow request never overwrites a newer one.
  const queue = useRef<Map<string, Promise<unknown>>>(new Map());
  const versions = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!allowed) { setCharacters([]); setReady(false); clearItemImageCache(); return; }
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("characters").select("id,data,updated_at").order("created_at");
      if (!alive) return;
      if (error) toast.error("Не удалось загрузить героев");
      versions.current = new Map((data ?? []).map(r => [r.id, r.updated_at]));
      setCharacters((data ?? []).flatMap((r) => { try { return [normalizeCharacter(r.data)]; } catch { return []; } }));
      setReady(true);
      setLocalHeroes(loadAll());
    })();
    return () => { alive = false; };
  }, [userId, allowed]);

  const persist = useCallback((c: Character) => {
    const prev = (queue.current.get(c.id) ?? Promise.resolve()).catch(() => undefined);
    const next = prev.then(async () => {
      try {
        const r = await saveOwned({data:{character:c,version:versions.current.get(c.id) ?? null}});
        versions.current.set(c.id,r.version);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось сохранить изменения"); throw error; }
    });
    queue.current.set(c.id, next);
    return next;
  }, [saveOwned]);

  const migrate = async () => {
    setMigrating(true);
    const existing = new Set(characters.map((c) => c.id));
    const rows = localHeroes.map((c) => toRow(existing.has(c.id) ? { ...c, id: crypto.randomUUID() } : c, userId));
    const { error } = await supabase.from("characters").insert(rows);
    setMigrating(false);
    if (error) { toast.error("Перенос не удался, герои остались в браузере"); return; }
    clearLocal();
    for (const row of rows) versions.current.set(row.id,row.updated_at);
    setCharacters((l) => [...l, ...rows.map((r) => normalizeCharacter(r.data))]);
    setLocalHeroes([]);
    toast.success(`Перенесено героев: ${rows.length}`);
  };

  const value: Store = {
    refresh: async () => {
      if (!allowed) return;
      const { data, error } = await supabase.from("characters").select("id,data,updated_at").order("created_at");
      if (error) throw new Error("Не удалось обновить героев");
      versions.current = new Map((data ?? []).map(r => [r.id,r.updated_at]));
      setCharacters((data ?? []).map(r => normalizeCharacter(r.data)));
    },
    ready,
    characters,
    get: (id) => characters.find((c) => c.id === id),
    upsert: (c) => {
      if (!allowed) return Promise.reject(new Error("Доступ закрыт"));
      const u = { ...reconcileEffects(c), updatedAt: new Date().toISOString() };
      setCharacters((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? u : x)) : [...l, u]));
      const write = persist(u);
      void write.catch(() => undefined);
      return write;
    },
    remove: (id) => {
      if (!allowed) return;
      setCharacters((l) => l.filter((x) => x.id !== id));
      void supabase.from("characters").delete().eq("id", id).then(({ error }) => { if (error) toast.error("Не удалось удалить"); });
    },
  };

  if (!allowed) return <div className="mx-auto max-w-lg p-6"><AccountBar email="" /><h1 className="mt-8 text-2xl text-gold">{access.data?.active === false ? "Аккаунт заблокирован" : "Проверяем доступ"}</h1><p className="my-4 text-muted-foreground">{access.data?.active === false ? "Доступ к персонажам и каталогу закрыт. Данные сохранены." : access.error ? "Не удалось проверить доступ." : ""}</p>{access.error && <Button variant="outline" onClick={() => access.refetch()}>Повторить</Button>}</div>;

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
