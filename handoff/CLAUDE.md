# handoff — Claude Code instructions

Dynamic parenting rig for After Effects, shipped as a single `.jsx` with the
pseudo-effect `.ffx` embedded as a hex-escape binary string. End users only
need `Handoff.jsx`. Source-of-truth `.ffx` lives at `handoff/Handoff.ffx`
for editing in Pseudo Effect Maker.

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

Test fixture: `dynamicParenting` comp (id `80485`). Layer IDs change
across sessions — always use `list_layers` or `initialize_session` to
get current IDs. Look for layers named `Apple`, `Right Hand`,
`Left Hand`. Use `__handoff_applyById(layerId)` via `$.global` to
apply/refresh the rig programmatically after `$.evalFile` on the script.

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

## Rigid fallback architecture (v1.2.0)

The rigid fallback now runs for ALL parents with constant weight (no
weight keyframes), not just static parents (the old `_rHasKeys` gate).
This means keyframed parents also get rigid tracking via
`parent.toWorld(BAKED_LOCAL_P, time) - BAKED_CHILD_REST`.

Parents with weight keyframes are handled by the segment walker for
crossfade/handoff transitions. No double-counting because the rigid
fallback skips those parents (`_rwp.numKeys > 0 → continue`).

## refreshRig must clear expressions first (v1.2.0)

`refreshRig` clears ALL transform expressions BEFORE calling
`writeExpressions`. Without this, the two-pass visual-preservation
snapshot captures the old rig's stale-bake output (e.g. child snapped
to parent center), and the offset locks in that wrong position.

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

## Known open issue — child-move-after-parenting (next session)

When the user moves the child AFTER parenting, `BAKED_LOCAL_P` and
`BAKED_CHILD_REST` reference the old position. The rigid fallback
computes orbit/scale deltas relative to the old position, so:

- Position: child jumps to wrong location
- Rotation orbit: orbits around wrong center
- Scale radial: scales from wrong center

**Click Handoff to rebake** from the new position. This works correctly.

The auto-rebake poll (app.scheduleTask) solved this but destroyed undo
history. A future session should explore alternatives:
- CEP/UXP panel with event listeners (can detect property changes)
- Expression-level self-correction without baked references
- Hybrid: expression detects drift + stores correction in effect slider

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
