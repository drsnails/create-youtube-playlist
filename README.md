# Create YouTube Playlist

A Chrome Manifest V3 extension that filters loaded YouTube videos and adds them to the browser queue. It can also build a temporary queue from video tabs in the current window.

## Install or update

Open `chrome://extensions`, enable Developer mode, and use **Load unpacked** to select this folder. After updating the files, click the extension's Reload button and refresh your YouTube page. Reopen the popup on YouTube. The popup also initializes existing tabs when its content script is missing.

## When YouTube changes

1. Open the affected page and reproduce the failure.
2. Click **Export debug report** in the extension popup.
3. Attach the downloaded `youtube-debug-*.json` file in chat and describe the expected behavior.

No selector inspection or manual HTML organization is needed. If a failure involves a menu or hover-only control, open that menu or hover the video before exporting. A failed queue menu is left open for capture. A further capture may be needed for controls that disappear when the popup opens.

Reports contain sanitized rendered HTML, independent link contexts and tag counts, selected options, the last operation result, detection/missing-field counts, extraction provenance, and up to 100 extension events. Capture works without the adapter and when detection throws. HTML is stored as text inside JSON; it is not an executable webpage. Capture includes open shadow roots; closed shadow roots and JavaScript handlers/state cannot be captured.

Bounded `queueRegions` snapshots separately capture the miniplayer and queue panels, including panels beyond the main document snapshot's limits. Queue reader events identify the control layout and distinguish missing controls, unreadable counters, unassociated panels, and incomplete lists.

Reports omit script/style bodies, form contents, account header/menu contents, event handlers, unapproved attributes, and URL parameters except `v`, `list`, `index`, and `t`. Recognized email and credential patterns are redacted. They still contain page text, video titles, links, and search/filter options: review the file before sharing. Cookies, browser storage, and network headers are never collected. Reports are downloaded locally, with no automatic upload. Large snapshots are capped at approximately 3 million characters / 40,000 nodes; the report identifies truncation and also includes bounded independent link contexts.

## Maintenance structure

| File | Responsibility |
| --- | --- |
| `youtube/selectors.js` | Known card layouts, metadata fields, queue/menu selectors and localized action labels |
| `youtube/adapter.js` | YouTube discovery, extraction, readiness, scrolling and verified queue actions |
| `services/core.js` | Filtering, ordering, date thresholds and boolean/regex search on plain records |
| `services/diagnostics.js` | Selector-independent capture, privacy filtering and extension event history |
| `main.js` | Operation state, cancellation, progress and results |
| `content.js` | Content-script message routing |
| `popup.js` | Controls, persisted options, report download and visible errors |
| `background.js` | Browser-tab queue construction |

For a layout change, inspect the report's independent DOM/link contexts first, then update selectors or extraction in the adapter. Add a small sanitized representative fixture under `tests/fixtures` and an assertion for the failure before changing the adapter. Do not commit entire personal reports. Keep DOM assumptions out of the core logic. All injected modules are idempotent, and the controller is available across YouTube client-side navigation.

Known old and modern layouts have fallbacks. Renamed layouts can be discovered through video links, but unknown fields remain `null`: operations needing those fields produce visible errors. Metadata extraction prefers accessible labels inside metadata containers (for example, `252 thousand views` and `20 hours ago`) over abbreviated visible text. Abbreviated relative dates such as `20h ago`, `1d ago`, `4w ago`, and `2mo ago` are also supported. Reports identify whether each value came from accessible labels or visible text. View-count and relative-date text currently support English and Hebrew; other languages require adapter updates. Relative dates are approximate (months = 30 days, years = 365 days). Unwatched means no visible progress marker in a recognized layout, which is a UI inference rather than a complete watch-history guarantee.

Cards with a recognized **Members only** badge are excluded from queue selection before metadata validation, sorting, or count limits, in both standard and batch modes. Badge text and accessible badge labels are checked; title wording alone does not exclude a video. Their dates remain available for date-based loading. Reports include each card's `membersOnly` flag, an eligible video count, and `skipped.membersOnly`; missing-field counts apply to eligible videos. Missing view counts on ordinary public cards still produce an error when sorting by Top.

Load by date requires a channel's **Videos** page in **Latest** order. Loading stops at the requested age, after three attempts with no new IDs, on navigation, or at a bounded attempt limit. Queue actions wait for rendered controls and confirm an added queue link or a remove-from-queue state. Unconfirmed clicks fail visibly and are never automatically retried, to avoid duplicate additions.

Ready queue controls and menus are used immediately, and confirmed additions yield to YouTube without a fixed pause. Confirmation checks inspect links for the current video and ignore unrelated style/animation changes. Debug reports include per-video timings: `actionMs` measures preparation before clicking, `clickMs` measures the synchronous automated click handler, and `waitMs` measures the wait for confirmation after the click returns. The existing `confirmationMs` includes both the click handler and that wait; `durationMs` covers preparation through confirmation.

**Faster queuing (experimental)** is an optional checkbox, off by default. It uses the same filters, ordering, and count limits. The first addition is individually confirmed to initialize the queue. The extension then opens the miniplayer's queue expand button (newer info-bar layout) or Playlist menu (older layout) to read the full queue. Queue panels outside the miniplayer must be linked by `aria-controls` or the same playlist ID as its navigation links; an unrelated visible playlist is insufficient. Thumbnail and title links within one panel row count as one video. If the list is complete and the remaining selected IDs are not already queued, it submits up to three additions sequentially before waiting for the full expected queue, including the existing prefix and exact new ID order. It briefly opens the queue for these checks and closes it when verification succeeds. Menus opened by the extension are left open on a batch verification failure for report capture.

If the complete list cannot be read before any batch is submitted, or selected videos are already queued, it uses standard mode for the remaining videos and says so in the result. After submitting a batch, missing, extra, reordered, or unreadable entries stop the operation; submitted additions are never replayed or silently retried in standard mode. Stop prevents further clicks, while already submitted additions may still finish and are checked before the result is shown. Error results count only confirmed additions and identify the uncertain submitted batch. Debug reports include `queue-batch`, `batch-fallback`, and `batch-error` events. Batch item timings overlap; use the operation timestamps or `queue-batch` timings for elapsed time rather than summing individual item durations. Test this experimental mode on YouTube before relying on its speed or order guarantees.

The open-tabs action preserves tab order, deduplicates video IDs, and includes at most 50 videos; omitted videos are reported. It uses YouTube's existing `watch_videos` URL behavior, which is unofficial and may change. No saved playlist or OAuth integration is added.

## Validation

Node.js 22+:

```sh
npm ci --ignore-scripts
npm run check
npm test
```

Fixtures include representative synthetic layouts and small anonymized reproductions from captured reports; they do not guarantee compatibility with every live YouTube experiment. Before releasing, test an actual channel page: load older videos, filter/order them, verify queue order, stop an operation, reopen the popup, and export a report. Also test client-side navigation into a channel from a different YouTube page.
