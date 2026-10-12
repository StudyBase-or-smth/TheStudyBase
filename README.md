
StudyBase is a personal school reference tool that helps students organise their study materials in one place. It lets you manage subjects, topics, and units, track upcoming exams, assessments, and assignments on a built-in calendar, and keep an overview of your study progress — all saved locally and synced from a shared database.


Backend-Dev uses the standalone StudyBaseData server (the Server-Dev architecture) for storage and /api routes.

Run npm install, then npm start. The server listens on port 8787. Set STUDYBASE_WEBSITE_DIR to this checkout and STUDYBASE_DATA_DIR to your data folder. Copy standalone/secrets.example.json to secrets.json in that data folder and fill in the Firebase Admin credentials and any AI keys. Server credentials stay outside the browser.

When served by StudyBaseData, the website uses the server's own origin for storage and API calls. For file:// or a separate localhost development server it uses http://127.0.0.1:8787. Run npm test for port integration checks.

The editor supports keeping drafts across multiple topics and saving them together, with a shared subject/class implementation. HSC includes engineering formula practice and a formula dictionary. Suggestions on the hub and topic pages are stored on StudyBaseData. KnowledgeCompetition, notification commands, display-name sign-in, and server-backed Analyser history remain available.

Quality-of-life controls

Search opens global topic and note search (Ctrl/Cmd+K); type / to find actions. Reading settings offers comfortable or wide content and comfortable or compact spacing. The hub shows recently opened topics. Subject navigation remembers the last topic, filters, expanded groups and scroll position.

The topic editor saves recoverable drafts on this device, labels batch saves explicitly, and supports Ctrl/Cmd+S. Cancel asks before discarding changed drafts. Escape still does not exit topic editing. Drafts, preferences, recent topics, navigation and Trash are scoped to the signed-in user on this browser; they are not server backups.

Use Select for multi-topic moves or deletion; subtopics move with their parent. Duplicate copies a topic and its descendants. Deleted topics have Undo and can be restored from Trash for 30 days on this device. Restore stops if it would overwrite newer topic content. Revise opens topic-focused flashcards or subject-filtered HSC practice where that subject is available.

Shared UI behavior lives in qol.js and qol.css; editor-specific behavior lives in subject/topic-qol.js. Tests use jsdom and an isolated fixture, without changing real study records.
