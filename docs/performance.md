# Dashboard performance

Unit status calculations reuse a single reversible crafting simulation for build counts, preserving the existing greedy ingredient order, Wisp substitution, and 100-unit display cap. Missing totals share one traversal. Legacy Custom data with craftable Common units retains the original batch-search behavior, because bulk Wisp fallback can choose different ingredients in those graphs.

A dataset-scoped recipe index stores direct usages, top-tier descendants, and inventory dependencies, including implicit Wisp dependencies. Dashboard snapshots compare inventory quantities and bans, calculate only affected units, and preserve result identity when displayed values are unchanged. Each dataset retains only its latest immutable snapshot; abandoned deferred renders can safely request older state again. Mutating inventory, bans, or the unit map in place is unsupported: update React state immutably as before.

Hover and recipe dialogs use one shared controller. Only the overlay subscribes to pointer changes; rows receive stable handlers, their own quantity/status, and their own ban flag. The controller retains the existing 150 ms pointer handoff. Shift activation synchronizes against the actual hovered row/panel before opening; releasing Shift in tooltip-off mode, losing window focus, or hiding the document clears stale hover. Tooltips remain invisible until their final side/fallback markup has been measured before paint. Recipe navigation, capability placement, viewport positioning, and independent panel scrolling remain unchanged. Category totals, alphabetical sorting, and subgroup order are cached by their actual inputs.

Quantity feedback uses a body-level, pointer-transparent portal, so row/dashboard clipping cannot cut off the text. Each change restarts a 1.2-second animation with a sustained readable phase; reduced-motion preference uses a stationary fade. The layer follows input positioning on scroll/resize and is removed when its animation ends.

Portraits use native image loading with asynchronous decoding and lazy loading outside the viewport. Browser HTTP/image caching replaces application-managed Blob URLs, with no duplicate image-fetch state or retained ObjectURLs. Existing image dimensions and error fallbacks are preserved.

## Verification

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/data.test.mjs tests/capabilities.test.mjs tests/performance.test.mjs
npm run lint
npm run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173
# With the preview running, in another terminal:
python tests/browser-capabilities.py
python tests/browser-performance.py
python tests/browser-tooltip-ux.py
```

The performance browser test observes React commits through a test-only DevTools hook, accounting for reused Fiber subtrees. It checks that hover commits update zero unit rows/groups, quantity changes avoid rendering every row, native images decode correctly, and the shared recipe dialog navigates without changing inventory. The tooltip UX test reproduces an out-of-order hover before Shift, checks stable geometry from the first visible animation frame, and verifies feedback duration, overflow escape, rapid changes, and reduced motion. No profiling code is included in the application.

Run `node --experimental-strip-types scripts/benchmark-performance.mjs` for a local calculation benchmark. An optional baseline TypeScript file path allows a direct comparison using the same dataset, inventories, warmup, and process. A baseline must be the standalone previous combination module without runtime imports. The benchmark does not alter application data or impose timing assertions on tests.

On the development machine, a comparison against the previous implementation gave these median times for all 278 units:

| Quantity of each Common, including Wisp | Previous | Optimized | Incremental Rare Hawkins quantity change |
| --- | --- | --- | --- |
| 0 | 4.64 ms | 2.63 ms | 0.39 ms |
| 10 | 53.83 ms | 9.41 ms | 0.86 ms |
| 100 | 540.30 ms | 23.17 ms | 2.00 ms |

These are Node function timings, not browser interaction latency; hardware, inventory distribution, and affected dependencies change the result. A Common or Wisp change can affect most recipes, while a high-tier ingredient typically affects fewer. In the production Chrome check, hover updated zero rows/groups; changing Rare Hawkins from 0 to 1 updated its own row immediately and 14 rows during the deferred status update, rather than all 278 rows.
