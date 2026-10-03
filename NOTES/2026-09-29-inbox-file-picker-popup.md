# Bigger inbox file-picker popup (parked)

Requested 2026-09-29, not built yet — explicitly asked to be kept in the list for later.

## What's wanted

Right now, picking a file "from inbox" to attach to an entry (e.g. the
document-preview panel in Supplier/Customer invoice, `NewEntryForm` in
`invoicing.jsx`) uses whatever compact inline picker/list already exists.

Instead: clicking "select from inbox" should open a **bigger, dedicated
popup/screen** that:
- Lists ALL inbox files (not a trimmed/compact list).
- Shows a live preview of the currently-highlighted file on the side
  (same split-view idea as the unified document-preview panel already
  used elsewhere — see `feedback_unified_preview_panel_spec` memory).
- Has an explicit "OK"/"Attach" action to confirm the selection, rather
  than attaching on click immediately.

## Where this would plug in

- `invoicing.jsx` — `NewEntryForm`'s invoice-mode document panel
  (`uploadToInbox`/`FileDrop onPick`, sets `form.attachmentId`) and the
  separate "Attachment (optional)" multi-file panel (`invAttachmentIds`).
- Likely also `ledger.jsx`'s `EditModal` attachment panel (`onAttachExisting`)
  — same "pick from inbox" action exists there for an already-saved bilag.

## Why parked

Session was mid-flow on other explicit asks (VAT-split bug fix, Bank
settings redesign, text/spacing polish) when this was raised. User said
to keep it in the list rather than build it in that pass.
