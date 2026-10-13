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

- Derived combat values and comparison use `deriveCharacter` in `src/lib/rules/derived.ts`, never mutate base stats/experience — one calculation keeps equipment and previews consistent.
- Item use operations live in the same pure rules module; optional active effects and remaining charges persist in character JSON through the existing provider, which reconciles unequipped effects — avoids a second storage system.

- Catalog templates and submissions live separately from personal inventory; protected server functions authorize through account_active and has_role, moderation and audit are committed by database functions — prevents client-side privilege and status changes.
- Catalog image paths use the catalog: prefix for the private catalog-images bucket; personal copies get their own files and are persisted server-side with optimistic concurrency and failed-copy cleanup — preserves ownership and avoids orphaned copies on save failure.
- CharactersProvider polls account access and hides protected content on blocking; restrictive database/storage policies remain the authority — already open sessions cannot bypass blocking.
