import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft, Backpack, Download, Heart, History, MoreVertical, NotebookPen, Pencil, Shield, Swords, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HeroAvatar } from "@/components/Avatar";
import { useCharacters } from "@/lib/characters-store";
import {
  PRIMARY_STAT_NAMES, SECONDARY_GROUPS, SKILL_TO_PRIMARY, addPrimaryExp, addSecondaryExp, getArmorClass,
  getCharacterLevel, getHpComponents, primaryRequired, secondaryRequired, uid, type Character,
} from "@/lib/rules";
import { exportCharacter } from "@/lib/storage";
import { STAT_META, fmtDate } from "@/lib/stat-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/character/$id/")({
  head: () => ({
    meta: [
      { title: "Персонаж — Летопись героев" },
      { name: "description", content: "Характеристики, навыки, история и заметки персонажа." },
      { property: "og:title", content: "Персонаж — Летопись героев" },
      { property: "og:description", content: "Лист персонажа домашней RPG-системы." },
    ],
  }),
  component: CharacterPage,
});

type Tab = "stats" | "history" | "notes" | "inventory";
const TABS: { id: Tab; label: string; icon: typeof Swords }[] = [
  { id: "stats", label: "Характеристики", icon: Swords },
  { id: "history", label: "История", icon: History },
  { id: "notes", label: "Заметки", icon: NotebookPen },
  { id: "inventory", label: "Инвентарь", icon: Backpack },
];

function CharacterPage() {
  const { id } = Route.useParams();
  const { ready, get, upsert, remove } = useCharacters();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("stats");
  const [target, setTarget] = useState<{ type: "primary" | "secondary"; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!ready) return null;
  const c = get(id);
  if (!c) return <div className="p-10 text-center">Персонаж не найден. <Link to="/" className="text-primary">На главную</Link></div>;
  const hp = getHpComponents(c);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:pb-10">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Все герои
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Меню"><MoreVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate({ to: "/character/$id/edit", params: { id } })}><Pencil /> Редактировать</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCharacter(c)}><Download /> Экспорт JSON</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Удалить</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="panel mb-5 flex flex-col items-center gap-4 p-5 sm:flex-row">
        <HeroAvatar src={c.avatar} name={c.name} className="h-24 w-24" />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-gold">{c.name}</h1>
          <p className="text-muted-foreground">{c.race} · {c.characterClass}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Badge label="Уровень" value={getCharacterLevel(c)} icon={<Swords className="h-4 w-4 text-primary" />} />
          <Badge
            label="HP" value={hp.Итого} icon={<Heart className="h-4 w-4 text-destructive" />}
            title={`Раса ${hp.Раса} + Класс ${hp.Класс} + Тел. ${hp.Телосложение} + Стойк. ${hp.Стойкость} + Сила ${hp.Сила}`}
          />
          <Badge label="КБ" value={getArmorClass(c)} icon={<Shield className="h-4 w-4 text-primary" />} title="10 + уровень Ловкости" />
        </div>
      </header>
      <p className="mb-4 text-center text-xs text-muted-foreground sm:text-left">
        HP: раса {hp.Раса} · класс {hp.Класс} · телосложение {fmtSigned(hp.Телосложение)} · стойкость {fmtSigned(hp.Стойкость)} · сила {fmtSigned(hp.Сила)}
      </p>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur sm:static sm:mb-5 sm:flex sm:gap-2 sm:border-0 sm:bg-transparent">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] transition sm:flex-row sm:rounded-full sm:border sm:px-4 sm:py-2 sm:text-sm",
              tab === t.id ? "text-primary sm:border-primary sm:bg-primary/10" : "text-muted-foreground sm:border-border hover:text-foreground",
            )}
          >
            <t.icon className="h-5 w-5 sm:h-4 sm:w-4" /> {t.label}
          </button>
        ))}
      </nav>

      {tab === "stats" && <StatsTab c={c} onPick={setTarget} />}
      {tab === "history" && <HistoryTab c={c} />}
      {tab === "notes" && <NotesTab c={c} save={upsert} />}
      {tab === "inventory" && (
        <div className="panel grid place-items-center gap-3 p-12 text-center">
          <Backpack className="h-12 w-12 text-primary/70" />
          <h2 className="text-xl">Инвентарь</h2>
          <p className="max-w-sm text-sm text-muted-foreground">Сумка пока застёгнута. Здесь появятся предметы, снаряжение и золото героя.</p>
        </div>
      )}

      <ExpDialog c={c} target={target} onClose={() => setTarget(null)} save={upsert} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{c.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Персонаж, история и заметки будут удалены без возможности восстановления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { remove(c.id); navigate({ to: "/" }); }}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function Badge({ label, value, icon, title }: { label: string; value: number; icon: React.ReactNode; title?: string }) {
  return (
    <div title={title} className="min-w-20 rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="font-display text-2xl tabular-nums">{value}</div>
    </div>
  );
}

function ProgressBar({ value, max, className }: { value: number; max: number | null; className: string }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatsTab({ c, onPick }: { c: Character; onPick: (t: { type: "primary" | "secondary"; name: string }) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {PRIMARY_STAT_NAMES.map((p) => {
        const M = STAT_META[p]!;
        const s = c.primary[p]!;
        const req = primaryRequired(s.level, s.subIndex);
        return (
          <section key={p} className={cn("panel overflow-hidden border-t-2", M.border)}>
            <button onClick={() => onPick({ type: "primary", name: p })} className="w-full p-4 text-left transition hover:bg-accent/30">
              <div className="flex items-center gap-3">
                <div className={cn("grid h-10 w-10 place-items-center rounded-lg bg-muted", M.text)}><M.icon className="h-5 w-5" /></div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold">{p}</h3>
                  <p className="text-xs text-muted-foreground">подуровень {s.subIndex + 1}/5</p>
                </div>
                <div className={cn("font-display text-3xl tabular-nums", M.text)}>{s.level}</div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ProgressBar value={s.progress} max={req} className={M.bg} />
                <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">{req ? `${s.progress}/${req}` : "максимум"}</span>
              </div>
            </button>
            <div className="border-t border-border/60">
              {SECONDARY_GROUPS[p].map((sk) => {
                const ss = c.secondary[sk]!;
                const r = secondaryRequired(ss.level, ss.subIndex);
                return (
                  <button key={sk} onClick={() => onPick({ type: "secondary", name: sk })} className="block w-full px-4 py-2 text-left transition hover:bg-accent/30">
                    <div className="flex items-center justify-between text-sm">
                      <span>{sk}</span>
                      <span className="tabular-nums"><span className="text-xs text-muted-foreground">{ss.subIndex + 1}/3 · </span><b>{ss.level}</b></span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <ProgressBar value={ss.progress} max={r} className={cn(M.bg, "opacity-70")} />
                      <span className="w-20 text-right text-[11px] tabular-nums text-muted-foreground">{r ? `${ss.progress}/${r}` : "—"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const QUICK = [10, 25, 50, 100];

function ExpDialog({ c, target, onClose, save }: {
  c: Character; target: { type: "primary" | "secondary"; name: string } | null; onClose: () => void; save: (c: Character) => void;
}) {
  const [amount, setAmount] = useState("");
  const apply = (sign: 1 | -1) => {
    if (!target) return;
    const n = Math.trunc(Number(amount));
    if (!Number.isFinite(n) || n <= 0) { toast.error("Введите положительное число"); return; }
    const r = target.type === "primary" ? addPrimaryExp(c, target.name, sign * n) : addSecondaryExp(c, target.name, sign * n);
    save(r.character);
    if (r.error) toast.warning(r.error);
    else toast.success(`${target.name}: ${sign > 0 ? "+" : "−"}${n} опыта`);
    setAmount("");
  };
  const s = target ? (target.type === "primary" ? c.primary[target.name] : c.secondary[target.name]) : null;
  const req = target && s ? (target.type === "primary" ? primaryRequired(s.level, s.subIndex) : secondaryRequired(s.level, s.subIndex)) : null;
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { onClose(); setAmount(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-gold text-2xl">{target?.name}</DialogTitle>
          <DialogDescription>
            {s && <>Уровень {s.level}, подуровень {s.subIndex + 1}. {req ? `До следующего: ${req - s.progress}` : "Максимум"}</>}
            {target?.type === "secondary" && <><br />Повышение уровня даёт бонус опыта в «{SKILL_TO_PRIMARY[target.name]}».</>}
          </DialogDescription>
        </DialogHeader>
        <Input type="number" inputMode="numeric" min={1} autoFocus placeholder="Количество опыта" value={amount} onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply(1)} className="h-12 text-center text-lg" />
        <div className="grid grid-cols-4 gap-2">
          {QUICK.map((q) => (
            <Button key={q} variant="secondary" onClick={() => setAmount(String((Number(amount) || 0) + q))}>+{q}</Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => apply(-1)}>Убрать</Button>
          <Button variant="gold" size="lg" onClick={() => apply(1)}>Добавить</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTab({ c }: { c: Character }) {
  if (!c.log.length) return <div className="panel p-10 text-center text-muted-foreground">История пока пуста.</div>;
  return (
    <ol className="panel divide-y divide-border/60">
      {[...c.log].reverse().map((e) => (
        <li key={e.id} className="px-4 py-3">
          <div className="text-xs text-muted-foreground">{fmtDate(e.at)}</div>
          <div className="text-sm">{e.text}</div>
        </li>
      ))}
    </ol>
  );
}

function NotesTab({ c, save }: { c: Character; save: (c: Character) => void }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    save({ ...c, notes: [{ id: uid(), at: new Date().toISOString(), text: text.trim() }, ...c.notes] });
    setText("");
  };
  return (
    <div className="grid gap-4">
      <div className="panel grid gap-3 p-4">
        <Textarea rows={3} placeholder="Новая заметка…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="gold" className="justify-self-end" onClick={add}>Добавить заметку</Button>
      </div>
      {c.notes.map((n) => (
        <article key={n.id} className="panel p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{fmtDate(n.at)}</span>
            <span className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Изменить" onClick={() => { setEditing(n.id); setEditText(n.text); }}><Pencil /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Удалить" onClick={() => save({ ...c, notes: c.notes.filter((x) => x.id !== n.id) })}><Trash2 /></Button>
            </span>
          </div>
          {editing === n.id ? (
            <div className="grid gap-2">
              <Textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
                <Button variant="gold" onClick={() => { save({ ...c, notes: c.notes.map((x) => (x.id === n.id ? { ...x, text: editText } : x)) }); setEditing(null); }}>Сохранить</Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{n.text}</p>
          )}
        </article>
      ))}
    </div>
  );
}
