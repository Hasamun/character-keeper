import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ImagePlus, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HeroAvatar } from "@/components/Avatar";
import { useCharacters } from "@/lib/characters-store";
import {
  CLASSES, PRIMARY_STAT_NAMES, RACES, SECONDARY_GROUPS, STARTING_EXP, editorAdjust, newCharacter, type Character,
} from "@/lib/rules";
import { resizeImage } from "@/lib/storage";
import { STAT_META } from "@/lib/stat-meta";
import { cn } from "@/lib/utils";

export function CharacterEditor({ initial }: { initial?: Character }) {
  const isEdit = !!initial;
  const { characters, upsert } = useCharacters();
  const navigate = useNavigate();
  const [hero, setHero] = useState<Character>(() => initial ?? newCharacter());
  const [freeExp, setFreeExp] = useState(STARTING_EXP);

  const adjust = (type: "primary" | "secondary", name: string, dir: 1 | -1) => {
    const r = editorAdjust(hero, freeExp, type, name, dir);
    if (r.error) return toast.warning(r.error);
    setHero(r.character);
    setFreeExp(r.freeExp);
  };

  const reset = () => {
    const fresh = newCharacter();
    setHero({ ...hero, primary: fresh.primary, secondary: fresh.secondary });
    setFreeExp(STARTING_EXP);
  };

  const save = () => {
    const name = hero.name.trim();
    if (!name || name === "Без имени") return toast.error("Введите имя персонажа");
    if (characters.some((c) => c.id !== hero.id && c.name.toLowerCase() === name.toLowerCase()))
      return toast.error("Персонаж с таким именем уже существует");
    if (!isEdit && freeExp > 0) return toast.warning(`Распределите весь опыт: осталось ${freeExp}`);
    const final = { ...hero, name };
    if (!isEdit) final.log = [{ id: crypto.randomUUID(), at: new Date().toISOString(), text: "Персонаж создан" }];
    upsert(final);
    navigate({ to: "/character/$id", params: { id: final.id } });
  };

  const onAvatar = async (file?: File) => {
    if (!file) return;
    try {
      setHero({ ...hero, avatar: await resizeImage(file) });
    } catch {
      toast.error("Не удалось загрузить картинку");
    }
  };

  const Row = ({ type, name }: { type: "primary" | "secondary"; name: string }) => {
    const s = type === "primary" ? hero.primary[name] : hero.secondary[name];
    const maxSub = type === "primary" ? 5 : 3;
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className={cn("flex-1 text-sm", type === "primary" && "font-semibold")}>{name}</span>
        <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">ур. {s.level} · {s.subIndex + 1}/{maxSub}</span>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => adjust(type, name, -1)} aria-label={`Уменьшить ${name}`}><Minus /></Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => adjust(type, name, 1)} aria-label={`Увеличить ${name}`}><Plus /></Button>
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      <Link to={isEdit ? "/character/$id" : "/"} params={{ id: hero.id }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Назад
      </Link>
      <h1 className="mb-6 text-3xl font-bold text-gold">{isEdit ? "Редактирование" : "Новый персонаж"}</h1>

      <section className="panel mb-6 grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
        <label className="group relative mx-auto cursor-pointer">
          <HeroAvatar src={hero.avatar} name={hero.name} className="h-28 w-28" />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-background/60 opacity-0 transition group-hover:opacity-100">
            <ImagePlus className="text-primary" />
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} />
        </label>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Имя</Label>
            <Input id="name" value={hero.name} maxLength={120} placeholder="Как зовут героя?" onChange={(e) => setHero({ ...hero, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Раса</Label>
              <Select value={hero.race} onValueChange={(v) => setHero({ ...hero, race: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(RACES).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Класс</Label>
              <Select value={hero.characterClass} onValueChange={(v) => setHero({ ...hero, characterClass: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(CLASSES).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      {!isEdit && (
        <>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl">Стартовый опыт</h2>
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw /> Сбросить</Button>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Распределите {STARTING_EXP} опыта. Уровни при создании — от −2 до 4.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRIMARY_STAT_NAMES.map((p) => {
              const M = STAT_META[p];
              return (
                <div key={p} className={cn("panel border-l-4 p-3", M.border)}>
                  <div className={cn("mb-1 flex items-center gap-2", M.text)}><M.icon className="h-4 w-4" /></div>
                  <Row type="primary" name={p} />
                  <div className="mt-1 border-t border-border/60 pt-1 pl-2">
                    {SECONDARY_GROUPS[p].map((s) => <Row key={s} type="secondary" name={s} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {!isEdit && (
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Свободный опыт</div>
              <div className={cn("font-display text-2xl tabular-nums", freeExp === 0 ? "text-success" : "text-gold")}>{freeExp}</div>
            </div>
          )}
          <Button variant="gold" size="lg" className={cn(isEdit && "w-full")} onClick={save}>
            {isEdit ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>
    </main>
  );
}
