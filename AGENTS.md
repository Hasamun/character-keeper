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
- Characters persist in browser localStorage via `src/lib/storage.ts` + `CharactersProvider`, read only after mount — single-user, no backend, avoids hydration mismatch.
