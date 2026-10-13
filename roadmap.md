# Roadmap

- [x] First admin assigned (redkillerprog@gmail.com)
- [x] Step 1: Cloud, sign-in (email + Google), password reset, heroes in the database, browser-to-account migration, HP back, new tabs, signed exp input
- [x] Step 2: item model (ranks F–S, types/subtypes, weapon/armor stats, effects), item cards (grid/list), item page, inventory on new model, cloak slot, conflict/requirement warnings
- [x] Step 3: derived stats (AC, attack, damage, bonuses, resistances), active effects, consumables with charges, item comparison

## Subsequent approved stages (not part of Step 3)
- [x] Step 4: shared catalog (search, filters, sort, paging, lazy images, image storage + thumbnails), moderation workflow, admin area, logs
- [ ] Step 5: sharing characters with per-section rights, invites by account and link (approved; implementing)
- [ ] Step 6: import/export (JSON, CSV, images, ZIP) with preview and duplicate handling, manual backup, final polish and checks

## Verification follow-up
- [ ] Step 4 access matrix: RPC checks passed with authorized temporary non-admin account (administrative denial, same-session blocking/restoration, exactly one concurrent decision); live-screen blocking/restoration still to verify.

Verified Step 4: 55 tests; signed-in proposal creation with image, approval, catalog image rendering, copy persisted after reload, archive and audit, accounts page, mobile no overflow. Temporary heroes and catalog rows removed.
