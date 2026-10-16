# Flashcards and FSRS

StudyBase uses **ts-fsrs 5.4.2 (MIT)**, pinned in npm. Its unmodified browser bundle
and licence are committed in `vendor/ts-fsrs/`, so the scheduler needs no CDN.
No Anki source is copied and no AI features are added. After intentionally updating
the dependency, run `npm run vendor:fsrs` to refresh the bundle and licence.

## Study flow and settings

The default Study view shows overdue review/learning cards ordered by due date,
then new cards within the user-wide daily allowance. Counts show available new,
learning and review cards in the selected subject/unit. Defaults: desired retention
0.9 and 20 new cards/day. More → Scheduling settings accepts retention 0.8–0.97
and 0–1000 new cards/day. Limits are shared across subjects/classes and use local
calendar days; each newly introduced card counts once, even after multiple reviews.
Existing learning/review cards are not limited.

Reveal with Show answer or a card click, then choose Again, Hard, Good or Easy.
Each button shows an interval from `scheduler.repeat()`. A rating alone updates
scheduling; revealing and typing do not. Short-term learning steps are enabled,
fuzz disabled. Learning cards return when due, with a visible-page check every
30 seconds. All cards (practice) can deliberately review ahead of schedule and its
ratings also update FSRS. Shuffling is disabled in Study to preserve due ordering.

Topic editing, accepted answer variants, hiding/unhiding, unit filters, session
sizes, goals and reminders remain. Imported cards are personal; hide them without
editing shared topics. Goals still count distinct cards. StudyBase reminders need
the program backend and may be delayed while reviews are unsynced.

## Migration and stored data

Every card has `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`,
`learning_steps`, `reps`, `lapses`, `state`, and `last_review`. Stored dates are ISO
strings; a new card has `last_review: null`. Old schedules initialize as new through
`createEmptyCard()`, retaining the original record in `legacyScheduling`. Hidden
flags and other metadata, old sessions, goals and history remain. When space permits,
a pre-migration browser backup is saved at `studybase_flashcards_UID_pre_fsrs`.
Unreadable saved JSON is left untouched rather than replaced with an empty state.

Each card's `reviewLog` maps unique event IDs to rating, actual review timestamp,
previous FSRS state, chosen result, ts-fsrs log, retention and local day. Original
review evidence is retained for later parameter fitting; this feature does not fit
parameters. `fsrsBaseline` supports deterministic replay of merged histories.

## Offline and backend sync

Reviews persist immediately in the existing per-account browser state. The local
`pendingReviewIds` outbox survives reopening. Signed-in users use the existing
private `_flashcards_UID` sync key, saved in the program's configured data directory
(default `StudyBaseData/json/_flashcards_UID.json`). Guests stay local-only.
Deploy both the frontend and backend changes.

Before upload, clients merge remote state. The backend atomically unions events by
ID; it never discards review logs absent from a stale upload. Clients replay the
merged log through ts-fsrs when reading it. Only acknowledged outbox IDs are cleared.
A lost acknowledgement can resend the same IDs without double-applying a review;
new reviews made during upload stay queued. Reconnect retries immediately, with a
30-second retry after errors while open. Settings, imports, goals and day counts
also merge. Logs are not silently trimmed; backend state is limited to 16 MB.

An already loaded/cached deck can be reviewed offline with the bundled scheduler.
This does not add a service worker or an offline page installer. If browser storage
is full, resolve the reported error before closing the page.

## Import and small-deck test

More → Import cards accepts a UTF-8 tab-separated `.txt` file or pasted text:
`front<TAB>back<TAB>optional tags`. Tags use spaces or commas. Blank lines and lines
starting with # are ignored. Invalid rows and duplicate front/back pairs are skipped
and reported. Limits: 2 MB/file, 10,000 rows/import, front 5000 and back 20000
characters. Imported cards start as new and appear in All units outside topic focus.

1. Open an empty/test subject's Flashcards page and import
   `examples/flashcards-fsrs-sample.txt` (four cards and a comment).
2. Set new cards/day to 2. Study should offer two new cards. Reveal one and inspect
   all four intervals. Choose Again, then Easy on the next card. Neither should be
   immediately repeated before its due time. Reload and confirm the same schedule.
3. Raise the limit to 4 to make the other two available. Test retention 0.8 and 0.97
   on a mature card; higher retention generally shortens its review interval.
4. With a signed-in account, disconnect networking, review a card and reopen the
   cached/local page. Reconnect: its pending ID should clear after sync, with one
   added rep and one review log entry. Check the private sync key/program data file.
5. Confirm another account/guest has separate settings, imports and progress.

Run `npm test` in both repositories. Tests cover migration, actual scheduler
previews, limits, retention, imports, UI ratings, private storage and event merging,
including an upload that succeeds but loses its acknowledgement. Live account
verification still requires a running configured program backend.
