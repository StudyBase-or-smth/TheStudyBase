# Draw topics

Choose **Draw** in the topic type picker on a subject or class. Set a name and choose a canvas preset (A4 portrait 794 × 1123, A4 landscape 1123 × 794, 16:9 1600 × 900, square, or custom). The canvas updates immediately when a preset or valid width/height changes. Resizing changes the bounds only: existing strokes keep their size and coordinates. Shrinking clips overflow from view/export; enlarging restores those strokes. Use Undo to revert a resize.

Tools: Pen, Highlighter (30% opacity), whole-stroke Eraser, colour, size (slider plus an exact numeric pixel field, 1–100 px), Undo/Redo, and Pen only. Pen only ignores mouse/touch; turn it off to draw with a finger or mouse. Cancelled pointer gestures are discarded. Undo treats one erase gesture as one operation.

## Draw over a file

Use **Upload background** for a PDF, Word `.docx`, or PNG/JPG/WebP/GIF/BMP image. Conversion happens locally using the site's bundled PDF.js and Mammoth readers; original documents are not sent to an external conversion service. Legacy `.doc` must first be saved as `.docx` or PDF. Word uses a simplified paragraph/table/image layout; upload PDF for exact formatting.

Multi-page files have a **Drawing page** selector and separate strokes/canvas dimensions on each page. A single-page upload replaces the current background while retaining current strokes; a multi-page upload replaces the page set and keeps current-page strokes on the first imported page. Replacing an existing multi-page set asks for confirmation because later-page strokes would be removed. Undo restores the previous document. The background control switches between **Upload background** and **Remove background**. Removing the background leaves annotations intact. PNG export is available only in the read-only topic view and includes the selected page background.

Backgrounds are embedded raster images in the drawing JSON; strokes remain editable JSON. Canvas resizing preserves the background's original pixel bounds as well as stroke coordinates, so resizing clips/extends the page rather than stretching the document beneath annotations. Uploads are limited to 20 MB, 30 converted pages, and the drawing's overall 8 MB JSON limit. Images are reduced to at most 2400 px on their longest side; PDF pages to at most 1600 px.

The drawing scales to fit the available width and viewport height. Points and brush sizes are always stored in canvas pixels; devicePixelRatio affects only the display buffer. The page theme does not invert ink or the white canvas. **Export PNG** in the topic view renders the saved canvas dimensions, independent of display zoom or device pixel ratio.

## Storage and recovery

Draw uses the existing topic IDs, tree, editor, Save/Delete actions, class permissions and topic `/data` storage keys. `layout: "draw"` stores `content.drawData` in the standard serialized topic:

```json
{"v":1,"width":800,"height":600,"strokes":[{"points":[[20,30,0.2],[100,120,0.8]],"colour":"#1c1917","size":4,"tool":"pen","simulatePressure":false}]}
```

Pointer Events are the only drawing input path. Pen samples retain actual pressure; mouse and touch samples use simulated pressure. Coalesced samples are read when available. perfect-freehand `getStroke()` produces the outline, rendered as a filled Path2D. Simulated-pressure mode is stored per stroke so reopening produces the same result.

After each completed change, an account/source/topic-scoped local recovery copy is stored. Existing Draw topics debounce backend autosave for 700 ms; only drawing data is autosaved, leaving unfinished title/other form edits for the regular Save action. **Cancel does not revert already autosaved drawing edits**; use Undo to change the drawing. New Draw topics and conversions from another type recover locally until first saved as Draw. New-topic recovery uses a stable `new` slot per source; reopen a new Draw topic after a reload to recover it and re-enter the topic name. A successful explicit topic save clears its recovery slot. Existing offline topic sync retains failed uploads for retry.

Autosave cannot recreate a deleted topic or continue under a different signed-in account. Students view the canvas read-only and can export PNG; editor access follows the site's existing topic permissions. Deploy the backend validation changes alongside the frontend. No drawing or AI service is called.

If a local recovery drawing differs from a newer synced version, the editor offers **Recover local drawing** or **Use synced drawing** before accepting new strokes. This preserves late offline changes rather than silently discarding them because of a sync timestamp.

Limits: dimensions 64–8192 px, at most 32 million canvas pixels, 10,000 strokes, 250,000 total points and 8 MB of drawing JSON. Points outside resized canvas bounds remain valid. Invalid recovery files are retained rather than overwritten automatically. Browsers must support Canvas 2D, Path2D and Pointer Events.

## Library and licence

The pinned npm dependency is perfect-freehand 1.2.3. `npm run vendor:drawing` wraps the unmodified npm CommonJS distribution for the site's script loading. The bundled header and `vendor/perfect-freehand/LICENSES.txt` retain the MIT notice. No credits page is added. [Upstream documentation](https://github.com/steveruizok/perfect-freehand) describes pressure and getStroke options.

## Test checklist

Run `npm test` in Site and Backend-server-program. Automated tests cover JSON round-trips, pressure/coalesced events, mouse/touch, palm rejection, erasing, undo/redo, resizing, DPR transforms, read-only viewing, PNG dimensions, local recovery, debounce, autosave isolation, class permissions, validation and deletion. Canvas rendering/export and input devices are mocked; visual quality and physical hardware need these manual checks:

1. **Mouse:** create Draw, choose 16:9, draw a line and tap a dot. Change colour and size, highlight over ink, erase across a stroke in a single quick movement, and use Undo/Redo. Save, reload and export PNG from the topic view; check 1600 × 900 pixels. Resize smaller and larger; stroke coordinates and thickness must stay unchanged.
2. **Touchscreen:** turn Pen only off; draw with a finger. Moving over the canvas must draw rather than scroll the page. Add another finger mid-stroke; it must not take over the active stroke. Rotate the device and verify the drawing retains its proportions. Turn Pen only on; finger/palm contact must not add strokes.
3. **Pen/tablet:** turn Pen only on, draw with light then firm pressure; the pen width should vary. Rest a palm on the screen; it must not draw or interrupt the pen. Test rapid curves and pen lifts. Reopen the topic to check identical pressure-based shapes. Check a single pen tap, highlighter, and eraser.
4. **Recovery/sync:** edit a saved Draw topic offline, reload and recover it, then reconnect and reload after sync. Create an unsaved Draw topic, draw, reload and start a new Draw topic in the same source to recover it. Verify a student viewing a class drawing has Export PNG but no drawing tools. Delete the topic and ensure delayed autosave does not bring it back.
5. **Backgrounds:** upload a two-page PDF, annotate each page, switch back and confirm both drawings remain separate. Save/reload as a student, switch pages and export PNG. Repeat with a Word `.docx` containing paragraphs/table/images and a PNG/JPG. Remove a background, undo, resize the page smaller/larger, and verify neither the background nor strokes stretch. Check that a legacy `.doc` reports how to convert it.

## Files

Frontend: `drawing-core.js`, `subject/drawing.js`, `subject/drawing-import.js`, `subject/drawing.css`, `subject/topicapp.js`, `subject/subject.html`, `subject/class.html`, `sync-config.js`, `package.json`, `package-lock.json`, `scripts/vendor-drawing.cjs`, `vendor/perfect-freehand/perfect-freehand.js`, `vendor/perfect-freehand/LICENSES.txt`, `tests/drawing.test.cjs`, `tests/drawing-import.test.cjs`, and this document.

Backend: `drawing-data.js`, `access-policy.js`, `tests/drawing.test.cjs`, `tests/container.test.cjs`.
