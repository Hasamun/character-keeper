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
- Item images live in private storage bucket `item-images` under `{user_id}/{item_id}/`; shared reads require inventory permission and the character owner's path, editor uploads are copied into the owner's folder with failed-save cleanup — prevents granting access to unrelated files through injected JSON.

- Derived combat values and comparison use `deriveCharacter` in `src/lib/rules/derived.ts`, never mutate base stats/experience — one calculation keeps equipment and previews consistent.
- Item use operations live in the same pure rules module; optional active effects and remaining charges persist in character JSON through the existing provider, which reconciles unequipped effects — avoids a second storage system.

- Catalog templates and submissions live separately from personal inventory; protected server functions authorize through account_active and has_role, moderation and audit are committed by database functions — prevents client-side privilege and status changes.
- Catalog image paths use the catalog: prefix for the private catalog-images bucket; personal copies get their own files and are persisted server-side with optimistic concurrency and failed-copy cleanup — preserves ownership and avoids orphaned copies on save failure.
- CharactersProvider polls account access and hides protected content on blocking; restrictive database/storage policies remain the authority — already open sessions cannot bypass blocking.
- Character sharing uses section-filtered server DTOs and permission-checked atomic commits against `updated_at`; owner saves also compare versions — keeps one character store without leaking closed sections or silently overwriting concurrent edits.
- Membership, invitations and shared commits lock the character before invitation rows; one-use invite tokens are hashed and never returned from storage — serializes acceptance, revocation and rights changes safely.
- Transfer validation and reference remapping live in pure rules; archives contain character/item data and owned images only, and imports use owner-scoped version-checked writes — keeps portable copies from bypassing sharing or moderation.
- Acquired skills live in character JSON (`skills`, `exhaustion`) with pure progression rules in `src/lib/rules/skills.ts` (25 levels of add/update/remove patches, separate XP tables); skill active effects reuse `activeEffects` with `sourceType: 'skill'` and are never equipment-bound — one effect pipeline, equipment sync cannot drop them.
- Skill apply/XP/exhaustion/undo run through `skillAction` (pure `performSkillAction` + DB `commit_skill_action`): one locked, version-checked, op_id-idempotent commit of character JSON and `skill_action_log`; undo writes a compensating entry — journal and character never diverge.
- AI skill generation runs only in server function `generateSkill` (Lovable AI Gateway, server-held key) and returns an unsaved proposal; the model outputs fully resolved levels with stable keys, converted to patches by pure `aiDraftToDefinition`/`mergeSelectedLevels` — the user selectively accepts levels and nothing persists without the normal editor save.
- Skill catalog (`skill_catalog`, `skill_catalog_submissions`) is separate from personal skills; publish/review/archive go through SECURITY DEFINER functions with admin_audit, catalog copies are added server-side as independent level-1 instances with a version-checked write — moderation cannot be bypassed.
- Effect lifecycle (`instant|sustained|gm`) is separate from `automation`; only `sustained` skill effects enter `activeEffects`, unspecified ones never auto-activate, and apply resolves effects/cost at the pre-XP level — prevents false active markers and same-use level-up boosts.
- Shared section `skills` controls skills/exhaustion/skill effects; DB commits merge activeEffects by sourceType so inventory and skills sections never overwrite each other; member skill actions use service-role-only `commit_skill_action_member` after a permission check and never return the full character — no section leaks.
- Skill sharing permission has `use` (apply/undo only) between `read` and `edit`, enforced in `skillAction` and `commit_skill_action_member`; teaching never modifies the sender — own heroes get one version-checked recipient write, other players get a server-snapshotted `skill_transfer_offers` row accepted atomically by `accept_skill_offer` — no client-side two-row rollbacks.
