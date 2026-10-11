import { BookOpen, Dumbbell, Eye, Feather, Shield, Sparkles, type LucideIcon } from "lucide-react";

export const STAT_META: Record<string, { icon: LucideIcon; text: string; bg: string; border: string }> = {
  Сила: { icon: Dumbbell, text: "text-stat-str", bg: "bg-stat-str", border: "border-stat-str/40" },
  Ловкость: { icon: Feather, text: "text-stat-dex", bg: "bg-stat-dex", border: "border-stat-dex/40" },
  Телосложение: { icon: Shield, text: "text-stat-con", bg: "bg-stat-con", border: "border-stat-con/40" },
  Интеллект: { icon: BookOpen, text: "text-stat-int", bg: "bg-stat-int", border: "border-stat-int/40" },
  Мудрость: { icon: Eye, text: "text-stat-wis", bg: "bg-stat-wis", border: "border-stat-wis/40" },
  Харизма: { icon: Sparkles, text: "text-stat-cha", bg: "bg-stat-cha", border: "border-stat-cha/40" },
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
