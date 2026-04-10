# handoff — Claude Code instructions

Dynamic parenting rig for After Effects. Two delivery modes:
1. **CEP panel** (`handoff/cep/`) — auto-rebakes via 100ms polling loop.
   Install for dev: `bash handoff/tools/install_cep_dev.sh`, restart AE.
2. **Standalone JSX** (`Handoff.jsx`) — fallback, requires manual rebake.

Source-of-truth `.ffx` lives at `handoff/Handoff.ffx`. CEP bundles it
directly; standalone JSX embeds it as hex-escaped binary.

## CEP architecture (v1.5.x)

`host.jsx` sets `$.global.__handoff_cep = true`, then `$.evalFile`s
`Handoff.jsx`. The IIFE detects CEP mode and exports functions to
`$.global.__handoff` instead of building ScriptUI. ONE source of truth.

`main.js` polls via `CSInterface.evalScript('cepReadRigState()')` every
100ms. Read-only calls do NOT create undo entries (unlike scheduleTask).
Writes only on detected changes — one undo group per rebake ("Handoff
Auto-Update"). Status bar shows live state: Tracking/Settling/Rebaking.

**Change detection triggers:**
- Parent added/swapped → `cepApplyOrRefresh` (recompute from rest)
- Weight dropped to 0 (unparent) → `cepPreserveAndRebake` (preserve visual)
- Weight keyframes moved/added/removed → `cepApplyOrRefresh` (recompute from rest)
- Child rest position changed → `cepApplyOrRefresh` (debounced, 300ms settle)

**Key distinction:** only unparenting (weight→0) preserves the POST-expression
visual. All other changes — including parent assignment — recompute from
the PRE-expression rest position. Using `cepPreserveAndRebake` for parent
additions bakes the current expression delta into the rest position,
corrupting all tracking (see failed approaches).

**Light-mode polling (v1.5.x):** during keyframe settling, the poll
skips expression evaluation (`cepReadRigState(true)`). Only parents,
weights, and the keyframe hash are read — no `valueAtTime` calls. This
prevents blocking AE's main thread during keyframe drags.

**Keyframe hash (v1.4.3+):** the weight key hash samples interpolated
values at three sentinel times (0, mid, end) instead of reading individual
`keyTime()` values. Reading `keyTime()` during active keyframe drags forces
AE to resolve overlapping keyframes, pushing the target keyframe forward.

**Undo (v1.5.x):** each CEP rebake creates one undo group ("Handoff
Auto-Update"). Cmd+Z requires two presses: first undoes the rebake,
second undoes the user action. Single-undo is architecturally impossible
with async CEP polling (the user action and the rebake are separate
events separated by the settling delay).

**FFX cache:** `ensureFFX` always rewrites the cached FFX from the
embedded blob (no size-comparison check). In CEP mode, the FFX is
loaded from `assets/Handoff.ffx` inside the extension folder.
`embed_ffx.js` copies the source FFX to both the JSX embed and the
CEP assets folder to keep them in sync.

**Live reload without restarting AE:**
- ExtendScript: `_handoffJSXLoaded = false; _ensureLoaded();`
- CEP panel JS: open `localhost:8088` in Chrome, Cmd+R

## Live AE testing — atom-ae MCP server

`atom-ae` is connected at `http://127.0.0.1:51310/mcp` (verify with
`claude mcp list`). Tools are NOT in Claude Code's deferred pool — call
directly via curl JSON-RPC:

```bash
curl -sS -X POST http://127.0.0.1:51310/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"<tool>","arguments":{...}}}'
```

Useful tools: `initialize_session` (call first, returns Atom instructions
+ active comp state), `run_extendscript` (auto-rollback checkpoints),
`revert_checkpoint` (id from prior output), `list_layers`, `get_keyframes`,
`scan_property_tree`, `preview_frames` (base64 contact sheets).

Test fixture: `dynamicParenting` comp (id changes across sessions).
Layer IDs change across sessions — always use `list_layers` or
`initialize_session` to get current IDs. Look for layers named `Apple`,
`Right Hand`, `Left Hand`, plus native-parented reference layers
`Apple (ae native) 1` and `Apple (ae native) 2`.

## Critical: pLocal baking via expression probes (v1.2.0)

**ExtendScript `worldToLayerLocal` does NOT match the expression engine's
`fromWorld`.** The manual 2D math diverges from AE's internal transform
pipeline when parents have rotation or scale. Verified live: the manual
math gave 500+ pixel errors; the expression engine round-tripped to 0.

`computeBakes` now uses **expression probes** to get correct pLocal:
set a temporary expression (`parent.fromWorld(childRest, bakeTime)`),
read the result, clear the expression. This guarantees the round-trip
identity holds (toWorld(fromWorld(X)) === X).

**Never use the manual `worldToLayerLocal`/`accumulatedRotation`/
`accumulatedScale` helpers for baking values that will be consumed by
expressions.** Always probe through the expression engine.

## Rigid fallback architecture (v1.3.x)

The rigid fallback runs ONLY for **static parents** (no keyframes on the
parent layer's own position/rotation/scale AND no keyframes on the weight).
It is skipped when:
1. `HANDOFF_BAKED_SLOTS_VALID[p] === false` (slot empty at bake time)
2. `_rlyr.index !== HANDOFF_BAKED_PARENT_INDICES[p]` (parent swapped)
3. `_rlyr.position.numKeys > 0` etc. (parent is keyframed — segment walker handles it)

**DO NOT run the rigid fallback for keyframed parents.** The segment walker
already computes the correct delta via live fromWorld/toWorld. Running both
double-counts the parent's contribution (verified: 2x position, 2x rotation,
2x scale).

## Apply-time preservation (v1.3.2, extended v1.4.0)

Both `refreshRig` AND `cepPreserveAndRebake` read `readOldApplyTime(layer)`
BEFORE clearing expressions, then pass the saved time to `writeExpressions`.
All snapshot/bake/calibration operations use this time, not `comp.time`.
Without this, rebakes triggered by CEP at arbitrary playhead positions
anchor the rig at the wrong time, making tracking correct only at the
playhead but wrong everywhere else.

`readOldApplyTime` is exported via `$.global.__handoff` for `host.jsx`
to call it from `cepPreserveAndRebake`.

## Rotation must use frame-by-frame Riemann sum (v1.3.1)

`worldRot()` uses `atan2` which wraps at ±180°. The old closed-form
`unwrap(worldRot(lyr, time) - worldRot(lyr, 0))` fails for cumulative
rotation >180° — it clips 216° to -144°. Adding a weight keyframe
changed the code path (fast path → segment walk), producing inconsistent
rotation and "group mismatch" errors.

**ALL rotation computation now uses the Riemann sum** (frame-by-frame
`unwrap(rNext - rPrev)` accumulation), both for constant-weight and
variable-weight segments. Per-frame deltas are always <180° at any
reasonable framerate, so unwrap works correctly.

## refreshRig must clear expressions first (v1.2.0)

`refreshRig` clears ALL transform expressions BEFORE calling
`writeExpressions`. Without this, the two-pass visual-preservation
snapshot captures the old rig's stale-bake output (e.g. child snapped
to parent center), and the offset locks in that wrong position.

## Resolved: child-move-after-parenting (v1.3.0)

CEP poll detects child rest-position changes (debounced, 300ms settle
after mouse release) and auto-rebakes. The expression does NOT snap to
rest on child move — that caused visible flashing. The rigid fallback
runs with stale bakes (slightly wrong orbit center) for up to 300ms
until the CEP corrects it.

## Approaches that FAILED — do not retry

- **`app.scheduleTask` for auto-rebake polling.** Each poll cycle that
  modifies the project creates an undo entry. At 100ms intervals this
  floods the undo history — Cmd+Z jumps back unpredictably, restoring
  deleted comps and losing work. Fundamentally incompatible with a
  professional AE workflow.

- **Child-drift guard (suppressing position when `value != BAKED_CHILD_REST`).**
  Suppresses position tracking but leaves rotation/scale active, creating
  an inconsistent half-suppressed state. Looks broken. Drift guard on all
  3 channels would require cross-property access from rotation/scale
  expressions which isn't straightforward.

- **Runtime pLocal via `parent.fromWorld(value, time)` for static parents.**
  Round-trip identity: `toWorld(fromWorld(X, t), t) = X` always for
  static parents. Cannot detect a static parent drag from a single
  expression evaluation without baked references.

- **`$.evalFile` during testing creates floating palette windows.** Each
  call creates a new palette with its own IIFE scope. The LAST loaded
  palette's `$.global` functions win. Old palettes may still process
  events causing phantom bugs. ALWAYS close stale palettes (up to 30)
  before any `$.evalFile` call during testing.

- **`_restFresh` check in position rigid fallback (skipping when child
  rest != baked rest).** Causes the child to flash to its rest position
  for one poll cycle when the child is moved. The CEP debounced rebake
  handles child moves instead.

- **`fromWorld` freshness check for parent swap detection.** Comparing
  `parent.fromWorld(childRest, bakeTime)` to `BAKED_LOCAL_P` catches
  parent swaps but ALSO fires when the parent MOVES (same layer, different
  transform). This kills rigid tracking entirely. Use parent-INDEX
  comparison (`_rlyr.index !== BAKED_PARENT_INDICES[p]`) instead.

- **Rotation closed-form `unwrap(rB - rA)` for constant-weight segments.**
  Wraps incorrectly for cumulative rotation >180°. Adding a weight
  keyframe changes the code path, producing inconsistent values. Always
  use frame-by-frame Riemann sum.

- **`cepPreserveAndRebake` for keyframe changes.** Preserves the
  post-expression visual as the new rest value. If the expression was
  already producing garbage (stale offset), the garbage gets baked into
  the rest, creating a cascading corruption loop. Use `cepApplyOrRefresh`
  (recompute from actual rest) for keyframe/child-move changes.

- **`cepPreserveAndRebake` for parent additions.** Sets rest = cached
  post-expression visual at `comp.time`. This bakes the current parent
  delta into the rest position, corrupting all tracking. For parent
  additions (P2 assigned, weight=0), the expression was already tracking
  P1 — the cached visual includes P1's delta at comp.time. Setting rest
  to that, then re-anchoring at apply time (t=0), double-counts P1's
  contribution. Use `cepApplyOrRefresh` for parent changes; reserve
  `cepPreserveAndRebake` for unparenting only (weight→0).

- **Time guard on rebake (skip if playhead moved).** The guard compared
  `state.time` to `prev.time` and skipped the rebake if the playhead
  moved, BUT still updated the cache with the new parents/weights. This
  silently ate parent-change and unparent notifications — the change was
  cached but never acted on. Removed entirely: `cepApplyOrRefresh` uses
  `refreshRig` which reads apply time from the expression (playhead-safe),
  and `cepPreserveAndRebake` uses the previously cached visual (also safe).

- **Removing undo groups from CEP rebakes.** Without `beginUndoGroup`,
  each expression clear/write creates its own micro-undo entry (~10+ per
  rebake). Cmd+Z becomes unpredictable — you might undo a single
  `safeClearExpression` call. Always wrap rebakes in a single undo group.

- **Reading `keyTime(k)` in `cepReadRigState` weight key hash.** When
  two keyframes are near the same time during a drag, the ExtendScript
  read via `evalScript` forces AE to resolve the overlap, pushing the
  target keyframe forward by the inter-key distance. Use interpolated
  value samples at sentinel times instead of per-key time reads.

- **FFX cache with size-comparison check.** Same-length content changes
  (e.g. "by" → "at") pass the size check. `ensureFFX` now always
  rewrites. `embed_ffx.js` also copies to CEP `assets/` folder.

## Expression resilience: near-identical keyframes (v1.4.0)

When users drag weight keyframes close together, AE can throw:
- "attempt to get an item address from a position outside of list length"
- "zero denominator converting ratio denominators"

These are AE-internal errors from evaluating expressions while keyframes
are at near-identical times. Guards added to all three expressions:
1. **try/catch around `key(k).time`** — AE can delete/modify keys
   mid-expression-evaluation during UI drags.
2. **Segment deduplication** — boundaries within half a frame (`dt * 0.5`)
   of each other are merged, preventing zero-duration segments.

Applied to both `segsFor` (rotation/scale) and the position segment union
builder.

## AE expression engine — known traps (verified live in AE 2025)

These broke earlier rewrites. Don't rediscover them.

- **`valueAtTime(t, preExpression)`** — two-arg form is **ExtendScript ONLY**,
  not in expressions. Use single-arg form.
- **Recursive `thisProperty.valueAtTime(t-dt)`** — AE returns the raw
  keyframed value, NOT the expression's previous-frame output. Accumulator
  patterns DO NOT work. Use segment-based integration instead.
- **Array `+` `-` `*`** — broken on V8 expression engine. Use `add` / `sub`
  / `mul` / `length` vector helpers.
- **`if/else` and `while`** — must brace BOTH branches in expressions
  (`if (x) { a; } else { b; }`). The parser is strict.
- **`addProperty("Pseudo/anything")`** — fails unless the pseudo effect is
  already registered. Register via `layer.applyPreset(File)` with a `.ffx`
  containing the definition (Smart Rekt / rendertom pattern).
- **Pseudo effect sub-properties** — `canSetEnabled = false`. You CANNOT
  gray out a sub-property at runtime. We considered clamp expressions on
  the controls as a workaround but rejected it: 20+ expression badges
  cluttering the layer when the user presses EE is worse than no visual
  feedback. The position/rotation/scale expressions handle mutual
  exclusion mathematically via `wPropFor(p, channel)` instead — only the
  three transform properties carry expressions.
- **`applyPreset(file)` selection requirement** — target layer must be the
  SOLE selection, or AE creates a new Solid layer for the preset. Always
  `selectOnly(layer)` first.
- **Pseudo effect "groups" are visually nested but FLAT in the property
  tree.** Header rows are NO_VALUE (`pvt=6412`). Access children by name
  at the effect's top level: `effect("Handoff")("P1 Layer")`, not
  `.property("Parent 1").property("P1 Layer")` (which throws).
- **`addProperty` invalidates prior child refs** — re-acquire after each
  call.
- **`_rlyr.position.numKeys` works in expressions.** Layer references from
  `FX("P1 Layer")` support `.position`, `.rotation`, `.scale` accessors
  with `.numKeys` to check if the parent has transform keyframes.
- **`evalScript` reading `keyTime(k)` during UI drags pushes keyframes.**
  When two keyframes are near the same time, the ExtendScript read forces
  AE to resolve the overlap. Use interpolated value samples instead.
- **Pseudo effect label trailing periods** — AE strips trailing `.` from
  pseudo effect label display names in the Effect Controls panel. The data
  is correct in the FFX; it's an AE UI rendering behavior.

## Pseudo effect via embedded binary (Smart Rekt / rendertom pattern)

End users get a single `.jsx`. The `.ffx` is hex-encoded as `\xHH` escape
sequences between `// EMBED:BEGIN` / `// EMBED:END` markers. On first run,
the script writes the bytes to
`~/Library/Application Support/aeTools/Handoff/Handoff.ffx` then
`applyPreset`s it. AE auto-registers the pseudo effect when applied.

Regenerate the embedded blob after editing the `.ffx` in Pseudo Effect Maker:

```bash
node tools/embed_ffx.js   # from the repo root
```

ExtendScript binary writes are byte-exact when `file.encoding = "BINARY"`
and the string contains only code units 0x00–0xFF — verified with all 256
byte values round-tripping cleanly.

## Code style (ExtendScript)

- ES3 only: `var`, `function` keyword, no `let`/`const`/arrow/destructuring.
- Always brace `if/else` AND `while` bodies in expressions (parser quirk).
- Use `add`/`sub`/`mul`/`length` vector helpers, never `+`/`-`/`*` on arrays.
- Use `propByMatchPath(layer, path)` runtime helper from atom-ae.
- Never `comp.layer(idx)` — use `app.project.layerByID(id)`.
- Re-acquire property refs after each `addProperty` (it invalidates priors).

## Pre-flight before sending to live AE

```bash
cp handoff/Handoff.jsx /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```

Plus: extract `EXPR_POSITION` / `EXPR_ROTATION` / `EXPR_SCALE` from the IIFE
and `new Function()` each to catch expression-string parse errors before
they show up "Expression Disabled" in AE. The script `tools/build_pseudo_test.js`
does this automatically when generating the test rig.
