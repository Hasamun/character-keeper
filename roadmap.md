# Roadmap

- [x] First admin assigned (redkillerprog@gmail.com)
- [x] Step 1: Cloud, sign-in (email + Google), password reset, heroes in the database, browser-to-account migration, HP back, new tabs, signed exp input
- [x] Step 2: item model (ranks F–S, types/subtypes, weapon/armor stats, effects), item cards (grid/list), item page, inventory on new model, cloak slot, conflict/requirement warnings
- [x] Step 3: derived stats (AC, attack, damage, bonuses, resistances), active effects, consumables with charges, item comparison

## Subsequent approved stages (not part of Step 3)
- [x] Step 4: shared catalog (search, filters, sort, paging, lazy images, image storage + thumbnails), moderation workflow, admin area, logs
- [x] Step 5: sharing characters with per-section rights, invites by account and one-use seven-day link, owner-only management, filtered reads, atomic writes, shared private images
- [x] Step 6: import/export (JSON, CSV, images, ZIP) with preview and duplicate handling, manual backup, final polish and checks
  - [x] Implement transfer validation, files, images, and protected save
  - [x] Add transfer UI and exports
  - [ ] Verify round trips, access boundaries, failure cleanup, and downloads

## Verification follow-up
- [x] Step 4 access matrix: ordinary-account administrative denial, same-session RPC and live-screen blocking/restoration, exactly one concurrent moderation decision verified.

Verified Step 4: 55 tests; signed-in proposal creation with image, approval, catalog image rendering, copy persisted after reload, archive and audit, accounts page, mobile no overflow. Temporary heroes and catalog rows removed.

Verified Step 5: 67 tests; two-session invitation acceptance, hidden sections, shared note persistence and owner readback, live revocation, one-use/expired/cancelled link denial, direct full-JSON/deletion/owner-change/permission-write denial, read-only write denial, concurrent-write conflict, UI conflict retaining title/text, shared experience and consumable persistence, participant image upload copied to owner and rendered after reload, unrelated/injected image denial and new-URL denial after revocation, mobile no horizontal overflow. Temporary hero, account, sharing rows and uploaded test images removed. Preview build OK. Extended import/export and backups remain the next separately scoped stage; MCP remains separate.

Шаг 6 реализован: страница «Перенос и копии», JSON/CSV/ZIP, назначение изображений, PNG-карточки, предпросмотр и дубликаты, ручные архивы собственных героев, проверка версии и доступа при записи. Разбор файлов вынесен в Worker; правила персонажей не изменены.

Проверено: 91 тест; импорт временного героя и изображения, ZIP с двумя файлами изображений, восстановление копии, сохранение опыта/заметок/зарядов/экипировки, скачивание JSON/CSV/PNG, повторный импорт с пропуском, мобильный экран без горизонтальной прокрутки, отсутствие ошибок страницы. Временные герои и изображения удалены.

Проверки шага 6 пройдены: устаревшая запись отклоняется после правки в другой вкладке; массовый импорт сохраняет удачные записи, показывает ошибку по каждой и не повторяет сохранённые; удаление загруженных картинок работает; запись чужого героя, загрузка в чужую папку и прямая публикация в каталог отклоняются; набор уходит в каталог только как предложение на модерацию; скачивание на узком экране работает. Системное окно «Поделиться» проверено только по коду (в тестовом браузере его нет).
