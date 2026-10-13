<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Game rules live as pure functions in `src/lib/rules/` and are covered by tests; UI never reimplements them — keeps the ported system faithful to the original.
- Characters persist in Lovable Cloud table `characters` (whole character as `data` jsonb, owner-only RLS) via `CharactersProvider`; localStorage is only a one-time migration source — keeps the existing character format and rules untouched.
- All app pages live under `src/routes/_authenticated/` (client-only gate); roles live in `user_roles` + `has_role()` — never in profiles.
- Starting free exp in the creation editor is always derived from current levels (`computeFreeExp`), never kept as a running counter — prevents up/down exploits.
- Inventory items always stay in `inventory.items`; slots, weapon sets and belt only hold item ids (`src/lib/rules/inventory.ts`) — one source of truth, safe deletes.
- Item images live in private storage bucket `item-images` under `{user_id}/{item_id}/` (owner-only policies); items store storage paths, UI reads signed URLs via `useItemImage` — keeps images private and character JSON small.
