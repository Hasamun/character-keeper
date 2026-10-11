import { cn } from "@/lib/utils";

export function HeroAvatar({ src, name, className }: { src?: string; name: string; className?: string }) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-full border-2 border-primary/60 bg-muted shadow-glow grid place-items-center", className)}>
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-gold text-xl">{(name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
