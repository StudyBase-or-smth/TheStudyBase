# Math topic graph editor

## Dedicated Graphing tool

The tool follows `DESIGN.md`: shared site header, breadcrumbs, theme tokens, buttons and sharing dialog; a 272px project sidebar (220px on intermediate screens); and a keyboard-accessible mobile project drawer. Project navigation can be collapsed independently of subject navigation. Dark mode uses the site's `studybase_dark` preference. Formula variables use connected child rows and native disclosure controls in View mode.

The accent bar reveals a Back to Index arrow on hover or keyboard focus. The header reuses the subject/class profile, notifications, and settings components, with dark mode inside the profile popover. Account loading is optional: local graphs and shared snapshots remain usable when signed out or offline. Reading settings retain their shared account/guest scope; Content width adjusts workspace gutters, Spacing adjusts project/expression density, and Animations controls shell motion. Graph controls remain in the graph toolbar.

Layout exception: the expression panel remains wider than ordinary navigation to fit mathematical input. On narrow screens it stacks above the graph, while project navigation moves into a drawer. The canvas uses the available workspace rather than the hub's reading-width container. Embedded topic graphs continue to inherit their surrounding topic shell.

`graphing.html` is linked from the index Tools area. Its project sidebar supports creating, naming, saving, reopening and deleting graph projects. Projects are saved in this browser's local storage under `studybase_graphing_projects_v1`; they are not synced across devices. Unsaved edits prompt before changing projects or leaving the page. Edit/View switches reuse the topic graph editor and its linked, temporary variable inputs.

Share creates a URL-fragment snapshot of the authored formulas, project name and graph settings. Recipients open it in view mode and can save an independent copy. Subsequent author changes do not update an existing snapshot. Viewer points and value overrides are excluded from saving and sharing. Links must use the deployed page's address to work on other devices.

Math topics now use `subject/graph-editor.js` with pinned JSXGraph 1.11.1 and math.js 15.2.0 CDN assets. No API key is needed. Expression parsing follows math.js syntax and restricts the AST to scalar arithmetic, symbols, and the listed single-argument functions; it never calls eval.

The existing `desmosState` topic field now contains `{ v: 1, expressions: [{ id, text, color, hidden }], viewport: { xmin, xmax, ymin, ymax }, angleMode }`. `StudyGraph.migrate` converts old Desmos expression lists and viewport bounds when topics are normalized or mounted. It translates common LaTeX fractions, powers, roots, trig, pi, and absolute values; unsupported expressions remain visible with inline errors. The complete original object is retained in `legacyDesmos`. Migration is idempotent and saves through the existing topic persistence path; viewing a topic does not issue a migration write.

View mode keeps formulas read-only and provides number inputs and sliders for temporary parameter values. Viewer overrides update dependent graphs, stay outside the saved graph state, trigger no change callbacks, and reset when the graph is reopened. Local show/hide, pan, zoom, reset, angle and notation controls remain available. Topic edit permissions and the existing modal/inline/enlarged save paths are unchanged. Inequalities are skipped with an explanatory row message. Named function definitions plot their right-hand side; calling user-defined functions from other rows is not supported.

Each displayed formula is a collapsible parent with indented child variable inputs. For `x+2=y`, entering `x=1` updates `y=3` and marks `(1,3)`; entering `y=4` solves `x=2` and moves the marker. Other variable names work in either order, such as `q+2=u` and `u=q+2`. Editing a coefficient keeps the current input coordinate and recalculates the output. Reverse calculation searches for a real numeric solution using the current coordinate as its starting point; an impossible result shows an inline error and keeps the last valid point. Collapsing and notation changes preserve temporary values until the graph is reopened.

## Manual verification

The expression panel includes clickable Curve, Line, Wave, Point, and Parameter examples. An example fills an empty row or adds a new row. Inputs accept implicit multiplication (`2x`), Unicode powers (`x²`), π, ×, ÷, minus signs, `√(...)`, absolute-value bars, and common pasted LaTeX. Curves and vertical lines have no fill; points retain their solid colour.

1. Open a subject and a class page. Create/edit a Math topic and add `y = x^2`, `f(x) = sin(x)`, `2x+1`, `3sin(x)`, `sqrt(abs(x))`, `(2, 3)`, `x = 4`, `a = 1`, and `y = a*x^2`.
2. Move the slider; verify the parabola changes. Press Enter to add a row, delete a row, and toggle a colour dot. Enter an invalid expression and `y > x^2`; verify other graphs continue working.
3. Compare `sin(x)` in radians/degrees, pan by dragging, zoom with the wheel/pinch, reset, and save/reopen. Verify expressions, colours, hidden flags, angle mode, and viewport persist.
4. Open an old Math topic; inspect its saved JSON after editing/saving for `v: 1` and the original `legacyDesmos`. Check `\\frac{1}{2}x^2` and `\\sin(x)` migrate. Unsupported LaTeX should remain in the original data and report an error.
5. View as a student/guest; formulas stay read-only, while child values and parameter sliders update the graph locally. Test both directions of `x+2=y`, the marker position, collapse/expand, dark mode, a narrow viewport, fullscreen and the display pop-out. Reopen to confirm original values return. Check editing cancellation and navigation while libraries load.
6. In browser Network tools, verify no requests to Desmos or `/api/desmosKey`. Block the graph CDN, reopen a Math topic, and verify a load error appears without discarding the saved graph.

## Backend cleanup for StudyBaseProgram (not changed here)

Remove the `/api/desmosKey` route, its key handler, `DESMOS_API_KEY` environment/secret configuration, and related deployment documentation once old frontend deployments are retired.
