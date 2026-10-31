# Changelog

## 0.4.0 — click to copy, double-click to preview

- **One click copies the path, two clicks preview it.** A double click fires two clicks, so a copy scheduled by the first click is cancelled when the second lands (`CLICK_MS = 240`). Without that delay every double click would have copied first.
- Preview opens through `ctx.get('sidebarRight')` with `openResource(address, { preferNewPane: true })` — the address must be `dsh-resource://file/session/<sessionId>/<path>`; a bare `file/absolute` address is claimed by no preview type and throws. `preferNewPane` is what puts the file in the second pane when the column can split.
- A preview refusal now says which refusal it was: sidebar not ready, or format not claimed (whitelist `PREVIEWABLE`).
- Global pinned rows have no Session id, so `ownerOf(path)` finds the Session that produced the path.
- Row clicks `stopPropagation` (the Session row toggles on click), controls stop their own clicks from reaching the row, `Enter` on a focused row previews, focus ring uses the host's token instead of the accent.
- Dry-run coverage grew to 34 assertions, including the resource address shape and the double-click-cancels-copy rule.

## 0.3.1 — reject malformed pin paths

- `pinKey(path)` must keep a `/` after normalisation, otherwise the write route answers 400 `path must be a full path`, and `sanitizePins()` drops such rows on load. Shell escaping had once produced `D:Documents…` with every separator eaten; that row could never match a file yet stayed pinned forever.

## 0.3.0 — two pin scopes

- **Global pins** get their own section above every Session; **Session pins** reorder only that Session's list.
- Persisted host-side in `~/.dsh/session-artifacts-pins.json` (written to `.tmp`, then `renameSync`), served by `GET/POST /plugins/session-artifacts/pins` behind a loopback check, an `x-dsh-session-artifacts` header and an 8 KB body cap.
- Comparison runs through `pinKey()` — separators, trailing slash and case are normalised, so one pin matches every spelling of the path.
- File rows reveal a pin button on hover; pinned rows show an accent glyph (Session) or a muted one (global).

## 0.2.1 — look before you ship

- Three layout defects found by rendering the real component tree to a static page and looking at it: Windows paths truncated with `direction: rtl` came out as `···harness\default-workspace\…` garbage; 62 files filled the whole pane at once; the "this one" badge appeared twice, spending the accent budget twice.
- Fixes: `shortDir()` shortens in JS while CSS only ellipsises; the list caps at 12 rows with an "show all +N" link; the header badge is gone, the row keeps it.

## 0.2.0 — speak the skin's design language

- Colour only through host tokens (`--dsw-alias-*`), shapes from the 4/8/16 radius ladder, separators at 0.5px, motion only through `--dsh-claude-duration-*` / `--dsh-claude-ease-*`. Every token keeps a fallback so the tab renders with the skin off.
- Three motions: file rows fade-and-drop in staggered by `calc(var(--sa-i) * var(--dsh-claude-duration-instant) / 6)`, the chevron rotates at 200ms `ease-glide`, the toast rises at 150ms `ease-settle`. `prefers-reduced-motion` turns all of it off.
- Dropped the violet accent of the previous palette — it fought the skin's terracotta `#d97757`. The accent is now spent in three places only (count badge, current-Session badge, copy hover).

## 0.1.0 — first version

- Right-sidebar tab listing every Session's produced files, indexed from `~/.dsh/sessions/**/session.v4.jsonl.zstd`.
- **The log is a concatenation of zstd frames**; `zstdDecompressSync` stops after the first. The buffer is split on `28 b5 2f fd` and each slice decoded separately.
- Produced paths come from `tool/call` only — `write` / `edit` `file_path` values. Files a shell command created are deliberately not guessed.
- Incremental cache keyed on `size + mtime`, so a warm start costs ~0.2 s instead of ~3 s.
