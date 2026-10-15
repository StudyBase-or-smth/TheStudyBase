# Shared image editor

`image-editor.js` and `image-editor.css` provide the card and profile image editor. Both pages support JPG, PNG, and WebP uploads up to 10 MB, and can reopen their existing image using Adjust image.

The Scale / Crop toggle changes what the visible box controls. In Scale mode, drag the image box to move it, corners to scale proportionally, side handles to stretch, and the round handle above it to rotate. The opposite corner or edge stays anchored when resizing, including after rotation. In Crop mode, move or resize the crop boundary while keeping the image transform unchanged; the crop keeps the destination aspect ratio. The unselected area is shaded and excluded from export. Profile crops also show a circular guide.

Handles accept arrow keys; Shift gives larger steps. Fine adjustments contains keyboard-accessible zoom, rotation, stretch, and position sliders. Zoom ranges from 10% to 400%. Fit view brings the image and crop frame back into view without changing the saved image. Reset restores both the image and crop; Cancel makes no change.

Cards use a 3:1 export with a subject-coloured preview. Profile photos use a square export with a circular preview. Use image applies the edited pixels to the draft; Save image publishes a card cover, and the profile Save action retains the uploaded photo on the profile. Saving flattens the crop and transforms into a JPEG; upload the original again to recover areas cropped out of an earlier saved version.

The editor uses its own modal so opening it preserves the enclosing card settings dialog. Existing staff-only cover writes and account-owned photo uploads remain in use. Regression coverage includes crop geometry, stretching, rotation, cancel/reset, nested dialogs, draft saving, and stale profile uploads. Run `node --test tests`.
