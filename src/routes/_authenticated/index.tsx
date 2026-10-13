import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import { Plus, Shield, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HeroAvatar } from "@/components/Avatar";
import { useCharacters } from "@/lib/characters-store";
import { getArmorClass, getCharacterLevel, uid } from "@/lib/rules";
import { normalizeCharacter } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Летопись героев — трекер персонажей" },
      { name: "description", content: "Список ваших персонажей: прокачка характеристик, навыки, HP и класс брони." },
      { property: "og:title", content: "Летопись героев — трекер персонажей" },
      { property: "og:description", content: "Трекер персонажей для домашней RPG-системы." },
    ],
  }),
  component: Index,
});

function Index() {
  const { ready, characters, remove, upsert } = useCharacters();
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file?: File) => {
    if (!file) return;
    try {
      const c = normalizeCharacter(JSON.parse(await file.text()));
      if (characters.some((x) => x.id === c.id)) c.id = uid();
      upsert(c);
      toast.success(`Персонаж «${c.name}» импортирован`);
    } catch {
      toast.error("Не удалось прочитать файл");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Трекер персонажей</p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-bold text-gold">Летопись героев</h1>
      </header>

      <div className="mb-6 flex flex-wrap justify-center gap-3">
        <Button variant="gold" size="lg" asChild>
          <Link to="/new"><Plus /> Создать персонажа</Link>
        </Button>
        <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
          <Upload /> Импорт
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
      </div>

      {ready && characters.length === 0 && (
        <div className="panel p-10 text-center text-muted-foreground">
          Пока нет ни одного героя. Создайте первого — его история начнётся здесь.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {characters.map((c) => (
          <div key={c.id} className="panel group relative flex items-center gap-4 p-4 transition hover:shadow-glow">
            <Link to="/character/$id" params={{ id: c.id }} className="absolute inset-0" aria-label={`Открыть ${c.name}`} />
            <HeroAvatar src={c.avatar} name={c.name} className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">{c.name}</h2>
              <p className="text-sm text-muted-foreground">{c.race} · {c.characterClass} · ур. {getCharacterLevel(c)}</p>
              <div className="mt-1 flex gap-4 text-sm">
                <span className="flex items-center gap-1"><Shield className="h-4 w-4 text-primary" />{getArmorClass(c)}</span>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="relative z-10 text-muted-foreground" aria-label="Удалить">
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить «{c.name}»?</AlertDialogTitle>
                  <AlertDialogDescription>Персонаж, история и заметки будут удалены без возможности восстановления.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => remove(c.id)}>Удалить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </div>
    </main>
  );
}
