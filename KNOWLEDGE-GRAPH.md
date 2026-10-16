# Knowledge graph beta

Each subject and class has its own knowledge graph, enabled by default. Existing topics and their parent/child hierarchy are unchanged. The topic editor has a **Knowledge graph** button that opens the current topic ready to connect, including topics that have not been saved yet.

## Use the graph

1. In a topic editor, give the topic a name and select **Knowledge graph · Beta**. The graph opens in edit mode with the topic selected. Both graph views show the same included/connected topics, positions, unit colours and connection routing. Use **Add topic** in either editor to add another topic before visually connecting its handles. Connect the topic, then select **Confirm** to return to the editor with all your fields intact. Save the topic to persist its connections; cancelling the topic edit discards them. Reopening either graph button during a topic edit preserves the current graph draft. Outside topic editing, the header graph button opens the saved graph directly.
2. Select **Edit graph**. Drag a node to position it. Connect its right **Used by** handle to the left **Prerequisite** handle on a topic that needs it. An arrow `Area → Stress` means learn Area before Stress. You can also select the two handles with clicks or Enter/Space.
3. Select a line to delete it. **Undo**, **Auto-arrange**, and **Cancel** help revise the draft. Select **Save** to keep changes.
4. Pan the background, zoom with the wheel or buttons, and use **Fit**, topic search or the unit filter to explore. Select a node for **Learn first**, **Used by**, and **Open topic** links. An included topic also has a **View connections** quick link that opens the graph centred on it.
5. To disable a graph, open **Edit graph**, clear **Enabled for this subject/class**, then save. The header button remains available to re-enable it. Disabling preserves nodes, connections and topic inclusion.

**Remove** beside the topic editor's graph button removes that topic from the saved graph and clears its incoming/outgoing connections when the topic is saved. The topic itself is retained. Cancel the topic edit to discard the removal.

Auto-arrange keeps prerequisite order from left to right, groups connected topics by unit and separates independent chains. Unconnected topics are placed in a separate area grouped by unit. Unit labels, node borders and handles share a colour; topics without units are gray. Connections between units blend the source and destination colours, with arrowheads matching the destination. Connections that would run through an intermediate node take a rounded detour.

Connections use a shortest rectilinear route around topic rectangles, with rounded bends and clearance around cards. Routing compares nearby corridors instead of always going above the graph. Drag previews snap to compatible handles and use the same route as saved connections. Overlapping cards may physically obstruct a port; moving them apart restores a clear route.

Auto-arrange widens busy column boundaries and increases row spacing around topics with many connections. The router also discourages overlapping parallel segments and provides lanes 16 graph units apart, favouring a small detour when it makes arrows easier to distinguish. Connections that share the same handle still meet at that handle. Click **Auto-arrange** to apply the roomier layout to saved positions.

Where separate lines cross, the horizontal connection makes a small bridge over the vertical line, with a gap underneath. Bridges keep the connection's colour/gradient and can be selected. Shared endpoints and parallel overlaps are not treated as crossings; closely spaced crossings combine into one bridge.

Each connection reserves a straight port approach. Lane separation is relaxed near shared endpoints, and routing penalises extra bends and disallows immediate reversals to avoid small loops around arrowheads. Arrowhead size stays constant when a line is selected.

Auto-arrange keeps the best crossing order found during directional sweeps and staggers busy columns to reduce false junctions at bends. Routing prefers clearance around existing turns. Hover a topic (or focus it with the keyboard) to highlight its direct prerequisites/dependents and connecting lines; unrelated nodes/lines dim. Clicking pins the selection, hovering temporarily previews another topic, and clicking empty canvas clears the selection. Highlighting changes styles without recalculating routes.

**Related Terms** on a topic lists its direct incoming prerequisite connections as text links, scoped to its own subject or originating class. The topic editor shows the same list as read-only text and updates it from confirmed graph drafts/removals. Change these terms through the graph button. Legacy manually authored `relatedTerms` data is preserved in storage but no longer controls this displayed section.

Keyboard: Tab through nodes/handles/lines; Enter/Space selects them. While editing, arrow keys move a focused node by 20 units (Shift: 60). Escape cancels an unfinished connection. Closing the graph discards unsaved edits.

## Permissions and storage

Subject graph editing follows subject topic permissions. Class graph editing requires a teacher/developer; students can browse. Linked class topics retain their originating class graph and the existing stricter linked-topic editing rules.

The topic flag `knowledgeGraphIncluded` survives normalisation, editing, import/export and sync. Graph settings, explicitly added topic IDs (`nodes`), directed edges and positions use a separate `/data` document: `knowledge_subject_<id>` or `knowledge_class_<id>`, schema `{v:1, enabled, nodes, positions, edges, updatedAt}`. Existing documents without `nodes` retain their topic flags and connections. Missing graph documents default to enabled. No migration overwrites existing topic data. Merely entering edit mode no longer adds unrelated topics to the canvas or alters its layout.

Saved changes are cached and placed in an account-scoped local outbox before upload. Failed uploads remain pending and retry on reconnection, authentication readiness, and every 15 seconds while the page is open. Local pending changes take precedence over downloaded graph data. Retrying sends the same graph snapshot, so it does not duplicate edges. Class permissions are checked again by the backend. Deploy the backend `access-policy.js` and `knowledge-graph.js` alongside the frontend for sync to accept graph documents.

## Beta scope and limits

Connections stay within one subject/class and are separate from topic trees. Self-links, duplicate links and circular prerequisite chains are prevented. Connected topics appear in the saved graph automatically. Deleted-topic references are pruned on the next save. The server validates links and positions (maximum 3,000 saved positions, 10,000 links and a 2 MB graph document).

This beta maps manually chosen dependencies; it does not diagnose quiz mistakes or infer mastery. Graph documents use the existing snapshot sync, so simultaneous edits on different devices are last-write-wins. Prefer one editor at a time. Topic editor connections are staged until the topic is saved, then written to the separate graph document and offline outbox. Multiple edited topics merge their graph changes into the latest locally cached graph.

## Test

Run `node --test tests/knowledge-graph.test.cjs` in Site and in Backend-server-program. Run `npm test` in both repositories for regressions.

For a manual check, edit Stress and use its graph button to link Area and Force to Stress. Confirm, verify the topic draft is intact, then save it. Reopen the header graph to check persistence; select Stress to see its prerequisites and open its topic. Try Stress → Area to confirm cycles are rejected. Also connect a new unsaved topic, confirm and save it; cancelling instead must leave the saved graph unchanged. Disable this graph, confirm another subject/class remains enabled, then re-enable. A student account must see class connections without editing controls. Save offline, reconnect, and reload to check recovery.
