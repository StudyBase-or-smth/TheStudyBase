# Flashcard goals and reminders

The companion Site client stores private review records, session positions, history, and goals at `_flashcards_UID`. The access policy restricts reads and writes to that account and validates version 1 state and reminder timezones. Deploy the updated access policy, study-reminders.js, and server.js alongside the frontend.

The server checks goals every 60 seconds while running. Each goal uses its configured IANA timezone and counts distinct reviewed card IDs for its subject/class on that local date. An enabled reminder creates one standard personal StudyBase notification after the configured time if the target is still unmet; reaching the target creates one completion notification. The private server-owned `_study_reminders_sent` ledger prevents repeat delivery even if notifications are cleared. It retains approximately 90 days of deduplication markers. Existing notification permissions and read-state behavior apply.

No extra API keys or push subscriptions are needed. This is in-app delivery; clients display the notifications when they connect. The scheduler needs the server running and synchronized progress. Tests: `node --test tests`.
