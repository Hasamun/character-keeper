import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Copy, ImageOff, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CatalogProposalEditor } from "@/components/CatalogProposalEditor";
import { catalogTemplate } from "@/lib/rules/catalog";
import { ItemUseActions } from "@/components/ItemUseDialog";
import { ItemComparison } from "@/components/ItemComparison";
import { ItemEditor } from "@/components/ItemEditor";
import { itemTypeLabel } from "@/components/ItemCard";
import { useCharacters } from "@/lib/characters-store";
import { useItemImage } from "@/lib/item-images";
import { pushLog, uid, type Character } from "@/lib/rules";
import { autoEquip, duplicateItem, findItem, isEquipped, removeItem, unequip, upsertItem, type Inventory, type Item } from "@/lib/rules/inventory";
import { ATTACK_MODE_LABELS, EFFECT_KIND_LABELS, effectLabel, itemRank, unmetRequirements, withHistory } from "@/lib/rules/items";
import { fmtDate } from "@/lib/stat-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/character/$id/item/$itemId")({
  head: () => ({
    meta: [
      { title: "Предмет — Летопись героев" },
      { name: "description", content: "Параметры, эффекты и история предмета героя." },
      { property: "og:title", content: "Предмет — Летопись героев" },
      { property: "og:description", content: "Карточка предмета из инвентаря героя." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ItemPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-2 text-base">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-border/50 py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}

function ItemPage() {
  const { id, itemId } = Route.useParams();
  const { ready, get, upsert } = useCharacters();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState<Item | null>(null);
  const [comparing, setComparing] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const c = ready ? get(id) : undefined;
  const item = c ? findItem(c.inventory, itemId) : undefined;
  const image = useItemImage(item?.image);

  if (!ready) return null;
  if (!c || !item) return <div className="p-10 text-center">Предмет не найден. <Link to="/" className="text-primary">На главную</Link></div>;

  const back = () => navigate({ to: "/character/$id", params: { id }, search: { tab: "inventory" } });
  const commit = (inventory: Inventory, log?: string) => {
    const next: Character = { ...c, inventory, log: [...c.log] };
    if (log) pushLog(next, log);
    upsert(next);
  };
  const eq = isEquipped(c.inventory, item.id);
  const r = itemRank(item);
  const unmet = unmetRequirements(c, item);
  const w = item.weapon, a = item.armor;

  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-4 pb-24">
      <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {c.name} · инвентарь</button>

      <div className={cn("rank-frame grid gap-4 rounded-2xl p-4 sm:grid-cols-[220px_1fr]", `rank-${r}`)}>
        <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-muted/50">
          {image ? <img src={image} alt={item.name} className="h-full w-full object-cover" /> : <ImageOff className="h-10 w-10 text-muted-foreground/40" />}
        </div>
        <div className="grid content-start gap-2">
          <div className="flex items-center gap-2">
            <span className="rank-badge rounded px-2 font-display font-bold">{r}</span>
            {eq && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">надето</span>}
            {item.quantity > 1 && <span className="text-sm text-muted-foreground">×{item.quantity}</span>}
          </div>
          <h1 className="rank-text font-display text-2xl">{item.name}</h1>
          <div className="text-sm text-muted-foreground">{itemTypeLabel(item)}</div>
          {item.description && <p className="whitespace-pre-wrap text-sm">{item.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {eq ? (
              <Button variant="outline" size="sm" onClick={() => { const res = unequip(c.inventory, item.id); commit(res.inventory, res.log); }}>Снять</Button>
            ) : item.category !== "misc" && (
              <Button variant="gold" size="sm" onClick={() => {
                const res = autoEquip(c.inventory, item.id);
                if (res.error) toast.error(res.error); else commit(res.inventory, res.log);
              }}>{item.category === "consumable" ? "На пояс" : "Надеть"}</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setProposal(catalogTemplate(item))}>Предложить в каталог</Button>
            <Button variant="outline" size="sm" onClick={() => setComparing(true)}>Сравнить</Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(item)}><Pencil /> Изменить</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const nid = uid();
              commit(duplicateItem(c.inventory, item.id, nid), `Скопирован предмет «${item.name}»`);
              navigate({ to: "/character/$id/item/$itemId", params: { id, itemId: nid } });
            }}><Copy /> Дублировать</Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDel(true)}><Trash2 /> Удалить</Button>
          </div>
        </div>
      </div>

      <ItemUseActions c={c} item={item} save={upsert} afterUse={next => { if (!findItem(next.inventory, item.id)) back(); }} />
      <ItemComparison c={c} item={item} open={comparing} onClose={() => setComparing(false)} />

      {unmet.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>Требования не выполнены: {unmet.map((u) => `${u.stat} ${u.min} (у героя ${u.have})`).join(", ")}. Надеть всё равно можно.</div>
        </div>
      )}

      {item.lore && <Section title="Предыстория"><p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.lore}</p></Section>}

      <Section title="Параметры">
        {w && <>
          <Row k="Урон" v={`${w.damage || "—"}${w.damageType ? ` (${w.damageType})` : ""}`} />
          <Row k="Бонус атаки" v={w.attackBonus > 0 ? `+${w.attackBonus}` : w.attackBonus} />
          <Row k="Атака зависит от" v={ATTACK_MODE_LABELS[w.attackMode]} />
          <Row k="Хват" v={w.twoHanded ? "Двуручное" : "Одноручное"} />
        </>}
        {a && <>
          <Row k="Бонус КБ" v={a.ac > 0 ? `+${a.ac}` : a.ac} />
          {a.armorType && <Row k="Тип брони" v={a.armorType} />}
        </>}
        {item.slot === "belt" && <Row k="Ячеек на поясе" v={item.beltCapacity} />}
        <Row k="Вес" v={item.weight ?? "—"} />
        <Row k="Цена" v={item.price != null ? `${item.price} зм` : "—"} />
        <Row k="Количество" v={item.quantity} />
      </Section>

      <Section title="Эффекты">
        {item.effects?.length ? (
          <ul className="grid gap-2">
            {item.effects.map((e) => (
              <li key={e.id} className="rounded-md bg-muted/30 p-2 text-sm">
                <div className="font-medium">{effectLabel(e)} <span className="text-xs text-muted-foreground">· {EFFECT_KIND_LABELS[e.kind]}</span></div>
                <div className="text-xs text-muted-foreground">
                  {[e.condition && `Условие: ${e.condition}`, e.duration && `Длительность: ${e.duration}`, e.charges != null && `Заряды: ${e.remainingCharges ?? e.charges}/${e.charges}`].filter(Boolean).join(" · ")}
                </div>
                {e.description && <p className="mt-1 text-xs">{e.description}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Нет эффектов.</p>}

      </Section>

      <Section title="Требования">
        {item.requirements?.length
          ? item.requirements.map((q, k) => <Row key={k} k={q.stat} v={`не ниже ${q.min} (у героя ${c.primary[q.stat]?.level ?? 0})`} />)
          : <p className="text-sm text-muted-foreground">Нет требований.</p>}
      </Section>

      <Section title="Происхождение">
        <Row k="Автор" v={item.author ?? "—"} />
        <Row k="Источник" v={item.source ?? "—"} />
        <Row k="Создан" v={item.createdAt ? fmtDate(item.createdAt) : "—"} />
      </Section>

      <Section title="Заметки">
        <Textarea rows={3} value={notes ?? item.notes ?? ""} onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes === null || notes === (item.notes ?? "")) return;
            commit(upsertItem(c.inventory, { ...item, notes: notes || undefined }));
            setNotes(null);
          }} placeholder="Личные заметки о предмете" />
      </Section>

      <Section title="История изменений">
        {item.history?.length ? (
          <ul className="grid gap-1 text-sm">
            {[...item.history].reverse().map((h, k) => <li key={k} className="flex gap-3"><span className="shrink-0 text-xs text-muted-foreground">{fmtDate(h.at)}</span>{h.text}</li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Пока пусто.</p>}
      </Section>

      <CatalogProposalEditor item={proposal} onClose={() => setProposal(null)} />
      <ItemEditor item={editing} onClose={() => setEditing(null)} onSave={(n) => {
        commit(upsertItem(c.inventory, withHistory(n, "Изменён")), `Изменён предмет «${n.name}»`);
        setEditing(null);
      }} />

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{item.name}»?</AlertDialogTitle>
            <AlertDialogDescription>{eq ? "Предмет надет — он будет снят и удалён." : "Предмет будет удалён из инвентаря."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { commit(removeItem(c.inventory, item.id), `Удалён предмет «${item.name}»`); back(); }}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
