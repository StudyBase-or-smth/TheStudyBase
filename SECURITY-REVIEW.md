# Security review

Reviewed the current frontend and companion Backend-server-program working trees on 15 October 2026. This is a source review with local, isolated proofs and regression tests; it is not a live deployment penetration test. Application code was not changed during this review. The issues below remain open.

## Confirmed findings

### High — stored JavaScript injection in the index feeds and calendar

Locations: [mainapp.js:273](C:/Users/Ethan/Documents/GitHub/Site/mainapp.js:273), [mainapp.js:289](C:/Users/Ethan/Documents/GitHub/Site/mainapp.js:289), [mainapp.js:345](C:/Users/Ethan/Documents/GitHub/Site/mainapp.js:345), and [access-policy.js:27](C:/Users/Ethan/Documents/GitHub/Backend-server-program/access-policy.js:27).

The index inserts topic and unit names into `innerHTML` without escaping them. Normal approved students may write subject topics and units, and the server preserves those names. A malicious name can therefore create an image with an executable error handler when another user opens the index. Calendar event IDs are also inserted directly into inline JavaScript handlers; the shared events key accepts these IDs without validation. This affects the active month renderer, even though the newer Upcoming renderer uses safer DOM construction.

Local verification: the real access-policy functions accepted synthetic student topic/unit records; running the actual `renderSidebar` function and dispatching the injected images' error events executed two harmless in-memory markers. A synthetic calendar event ID passed the same write policy and executed a marker when its rendered event was clicked. No requests to a live server or external destination were involved.

Impact: code execution in the browser session of whoever views the affected content, including teachers or developers, allowing actions with that user's privileges.

Fix: construct these rows with DOM methods and `textContent`. Replace inline event strings with `addEventListener` callbacks that close over the ID. Validate calendar IDs and event types on the server. HTML-encoding alone is insufficient for values interpolated into JavaScript strings. Add a regression that exercises malicious topic names, unit names, event IDs, and event types. A suitable Content Security Policy is an additional defence after migrating inline handlers.

### Medium — AI marking endpoints have no application-level usage budget or throttle

Locations: [api.js:330](C:/Users/Ethan/Documents/GitHub/Backend-server-program/api.js:330), [api.js:408](C:/Users/Ethan/Documents/GitHub/Backend-server-program/api.js:408), and [quiz-grade.js:41](C:/Users/Ethan/Documents/GitHub/Backend-server-program/quiz-grade.js:41).

Approved accounts can repeatedly call the marking endpoints using the configured server provider keys. No per-account quota, concurrency limit, or application spend budget is enforced. Authentication and input-size checks do not bound how many paid requests an account can initiate. The analyser provider fetches also lack the explicit timeout already present for Jev.

Local verification: forty successive synthetic student requests to `quizGrade` all returned success and invoked a mocked provider forty times. No real provider request or charge was made.

Impact: an approved or compromised account could consume shared provider credits and tie up requests, subject to any limits imposed outside this application. Reverse-proxy and provider-side limits were not inspected.

Fix: enforce per-UID and global quotas, concurrency limits, timeouts for every provider, and spending alerts/caps. Return HTTP 429 when a budget is exhausted. This is the resource-consumption risk described by [OWASP API4](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/).

### Medium — competition participants receive answer keys before answering

Locations: [access-policy.js:38](C:/Users/Ethan/Documents/GitHub/Backend-server-program/access-policy.js:38) and [kc.js:1345](C:/Users/Ethan/Documents/GitHub/Site/KnowledgeCompetition/kc.js:1345).

The lobby read policy hides game contents from nonparticipants, but returns the complete game to joined participants, including every question's `answers[].correct` flags. A player can inspect the response while the lobby is waiting and learn the answers before play starts. Server-side score calculation does not prevent this information leak.

Local verification: a non-host participant received a synthetic waiting lobby's future-question answer key through the real `readable` policy.

Fix: keep answer keys server-side. Return only released questions and answer text to players; disclose the correct option only when that question enters review. Update the client feedback flow to consume the server's review result rather than inspecting a full game object.

### Medium — unauthenticated name lookup discloses account email addresses

Locations: [api.js:491](C:/Users/Ethan/Documents/GitHub/Backend-server-program/api.js:491) and [api.js:506](C:/Users/Ethan/Documents/GitHub/Backend-server-program/api.js:506).

`resolveSignIn` returns an account email address for a unique full-name match or partial-name prefix, without requiring authentication. The existing IP-based thirty-request limit reduces bulk querying but does not remove the disclosure. Anyone who can reach the endpoint can test names and obtain matching account addresses.

Local verification: an unauthenticated synthetic three-character name-prefix request returned the fake account's complete email address. No real account directory was queried.

Fix: prefer email-based sign-in or an identity-provider flow. If display-name sign-in must remain, redesign it so the unauthenticated response does not expose the underlying email address, and use uniform responses and stronger enumeration controls.

## Dependency observation requiring attention

The vendored `vendor/pdfjs/pdf.min.js` identifies itself as PDF.js **3.11.174**, and [analyser.html:1488](C:/Users/Ethan/Documents/GitHub/Site/analyser.html:1488) does not explicitly disable evaluation. Mozilla lists this version in the affected range for **CVE-2024-4367**, a malicious-PDF JavaScript-execution issue, with `isEvalSupported: false` as a workaround and 4.2.67 as the first patched version. Upgrade the main library and matching worker together to a maintained patched release. See [Mozilla's advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq).

Reachability qualification: the current analyser calls `getTextContent()` and does not render page glyphs to a canvas. I did not establish that this application currently reaches the vulnerable rendering path, so this is a confirmed vulnerable-library observation, not a reproduced application-level PDF exploit.

## Checks and limits

- All 58 frontend and 22 backend regression tests passed. The new local proofs above identify gaps that those tests do not currently cover.
- Backend `npm audit --json` reported zero known vulnerabilities. This does not cover vendored frontend libraries or application logic.
- Frontend `npm audit` was rejected by automatic approval review because it would send dependency metadata to npm without explicit permission. It was not retried or bypassed. Completing that external audit requires permission to send the frontend dependency names and versions to npm's service.
- Existing tests exercise current Firebase claim verification, disabled/pending account rejection, private profile/analyser/flashcard ownership, staff-only card-image writes, protected notification edits, media ticket validation, avatar proxy redirect/size restrictions, and blocked static secret paths.
- No live account access, load testing, destructive payloads, real paid-provider calls, or production data changes were performed. Deployment TLS, reverse-proxy limits, Firebase project rules, and provider account budgets remain outside this source-only check.

Recommended order: fix stored injection first, add marking quotas, separate competition answer keys from player responses, remove account email disclosure, and update the vendored PDF library.
