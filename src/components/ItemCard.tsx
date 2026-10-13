import { Check, ImageOff } from "lucide-react";
import type { Item } from "@/lib/rules/inventory";
import { CATEGORY_LABELS, SLOT_KIND_LABELS } from "@/lib/rules/inventory";
import { effectLabel, itemRank, mainStat } from "@/lib/rules/items";
import { useItemImage } from "@/lib/item-images";
import { cn } from "@/lib/utils";

export const itemTypeLabel = (i: Item) =>
  [i.slot ? SLOT_KIND_LABELS[i.slot] : CATEGORY_LABELS[i.category], i.subtype].filter(Boolean).join(" · ");

function Thumb({ i, className }: { i: Item; className?: string }) {
  const url = useItemImage(i.thumb ?? i.image);
  return (
    <div className={cn("grid place-items-center overflow-hidden bg-muted/50", className)}>
      {url ? <img src={url} alt={i.name} loading="lazy" className="h-full w-full object-cover" />
        : <ImageOff className="h-6 w-6 text-muted-foreground/40" />}
    </div>
  );
}

export function ItemCard({ i, equipped, onClick }: { i: Item; equipped: boolean; onClick: () => void }) {
  const r = itemRank(i);
  const stat = mainStat(i);
  return (
    <button onClick={onClick} className={cn("rank-frame group flex flex-col overflow-hidden rounded-xl text-left transition hover:-translate-y-0.5", `rank-${r}`)}>
      <div className="relative">
        <Thumb i={i} className="aspect-square w-full" />
        <span className="rank-badge absolute left-2 top-2 rounded px-1.5 font-display text-xs font-bold">{r}</span>
        {i.quantity > 1 && <span className="absolute right-2 top-2 rounded bg-background/80 px-1.5 text-xs tabular-nums">×{i.quantity}</span>}
        {equipped && <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground"><Check className="h-3 w-3" /> надето</span>}
      </div>
      <div className="grid gap-0.5 p-2">
        <div className="rank-text truncate font-display text-sm">{i.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{itemTypeLabel(i)}</div>
        <div className="flex items-center justify-between gap-1 text-xs">
          <span className="truncate">{stat ?? ""}</span>
          {i.price != null && <span className="shrink-0 text-primary tabular-nums">{i.price} зм</span>}
        </div>
        {!!i.effects?.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {i.effects.slice(0, 3).map((e) => <span key={e.id} className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{effectLabel(e)}</span>)}
            {i.effects.length > 3 && <span className="text-[10px] text-muted-foreground">+{i.effects.length - 3}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

export function ItemRow({ i, equipped, onClick }: { i: Item; equipped: boolean; onClick: () => void }) {
  const r = itemRank(i);
  const stat = mainStat(i);
  return (
    <button onClick={onClick} className={cn("rank-frame flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:brightness-110", `rank-${r}`)}>
      <Thumb i={i} className="h-12 w-12 shrink-0 rounded-md" />
      <span className="rank-badge rounded px-1.5 font-display text-xs font-bold">{r}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rank-text truncate font-display text-sm">{i.name}</span>
          {i.quantity > 1 && <span className="text-xs text-muted-foreground">×{i.quantity}</span>}
          {equipped && <Check className="h-3.5 w-3.5 text-primary" aria-label="надето" />}
        </div>
        <div className="truncate text-xs text-muted-foreground">{itemTypeLabel(i)}{stat ? ` · ${stat}` : ""}</div>
      </div>
      {i.price != null && <span className="shrink-0 text-xs text-primary tabular-nums">{i.price} зм</span>}
    </button>
  );
}
