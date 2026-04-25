# vGallery Apply Script — design

**Date:** 2026-04-25
**Goal:** Single-file JSX with a ScriptUI panel that applies the vGallery rig
to selected layers and removes it from selected layers, with production-grade
reliability.

## Context

Phase 1 (complete) built the vGallery rig directly inside the user's AE
project — a controller shape layer carrying a pseudo-effect group plus a
master Drop Shadow, with per-image-layer expressions distributing layers
along a V. Phase 1 used **provisional naming** (`GALLERY CONTROLLER`,
`vGallery`, `Travel Location`, `Tint`, `Drop Shadow`, `image_` prefix);
Phase 2 standardizes on the new convention listed below. The Phase 1 docs
at `vGallery/CLAUDE.md` and `vGallery/EXPRESSIONS.md` still reference the
provisional names — they will be updated as part of Phase 2 implementation.

Phase 2 (this spec) ships the rig as a portable script. End user drops
`vGalleryRig.jsx` into AE's `Scripts/ScriptUI Panels/` folder, opens the
panel from the Window menu, and uses two buttons to rig (and unrig) selected
layers. The rig works identically to Phase 1's hand-built version — same
expressions, same controller structure.

## Naming convention (locked)

**Layer prefix:** `vG_` (auto-renamed). Detection: `name.toLowerCase().indexOf("vg") === 0`.
Auto-rename prepends `vG_` (consistent casing) when the prefix is missing.

**Controller layer name:** `vGALLERY CONTROLLER` (created with that exact casing).

**Effect names — on `vGALLERY CONTROLLER`:**
- `vGallery` (pseudo-effect group)
- `vGallery Drop Shadow` (master Drop Shadow)

**Effect names — on each image layer:**
- `vGallery Travel Location` (renamed `ADBE Slider Control`)
- `vGallery Tint` (renamed `ADBE Tint`)
- `vGallery Drop Shadow` (renamed `ADBE Drop Shadow`)

All references in expressions use these display names exactly.

## Architecture

### Deliverable

Single file: `vGallery/vGalleryRig.jsx`.

Source-of-truth pseudo-effect: `vGallery/vGallery.ffx`. Embedded as
hex-escaped bytes inside `vGalleryRig.jsx` between `// EMBED:BEGIN` and
`// EMBED:END` markers (rendertom pattern, identical to `Handoff.jsx` in
this repo).

### Build pipeline (existing repo tooling)

- `tools/embed_ffx.js` — re-runs after every `.ffx` edit; embeds bytes into
  the JSX. Add `vGallery/vGalleryRig.jsx` ⇆ `vGallery/vGallery.ffx` mapping
  to its `EMBED_TARGETS` array.
- `tools/bump_version.js` — version bump on commit; add
  `vGallery/vGalleryRig.jsx` to its `JSX_TARGETS` array.

### Runtime FFX install

On first run (or whenever the FFX cache is missing), the script writes the
embedded bytes to:
```
~/Library/Application Support/aeTools/vGallery/vGallery.ffx
```
and calls `applyPreset(file)` on the controller layer to register the
pseudo-effect with AE. `ensureFFX` always rewrites the cached file to avoid
the same-length-content trap (per `handoff/CLAUDE.md`).

### One source of truth for expressions

The canonical expressions live in `vGallery/EXPRESSIONS.md`. They are
duplicated into the JSX as quoted JS strings. Whenever expressions change,
edit both and bump version. (Manual sync is acceptable for v1.)

## ScriptUI panel

### Layout

```
┌──────────────────────┐
│  v1.0.0              │   ← version, tiny gray
│  ┌────────────────┐  │
│  │   Apply Rig    │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │   Remove Rig   │  │
│  └────────────────┘  │
└──────────────────────┘
```

Window mode: dockable ScriptUI panel via the
`(this instanceof Panel) ? this : new Window("palette", ...)` pattern.

### Modal alerts trigger only when

| Situation | Modal text |
|---|---|
| Apply clicked, active item not a Composition | "Open a composition to apply the rig." |
| Apply clicked, no layers selected, controller didn't exist | "vGALLERY CONTROLLER created. Select layers and click Apply to rig them." |
| Apply clicked, no layers selected, controller already existed | "Select at least one layer and click Apply." |
| Apply ran, ≥1 layer skipped or auto-renamed | Multi-section summary: rigged / auto-renamed (with old → new names) / skipped (with reason) |
| Apply hit unexpected error mid-flight | "Error applying rig to <layer>: <message>" |
| Remove clicked, no layers selected | "Select at least one layer and click Remove Rig." |
| Multiple controllers detected | Warning included in the apply summary |

Successful pure runs (no skips, no auto-renames, no errors) — completely
silent. The panel does no live status updates, no progress bar, no per-action
confirmation.

## Apply algorithm

Wrap the entire procedure in one `app.beginUndoGroup("vGallery: Apply Rig")` /
`app.endUndoGroup()` so Cmd+Z reverts the whole click.

```
1. Validate active item is a CompItem. Else: modal "Open a composition…" and return.
2. Locate controller (in priority order):
   a. Any layer in the comp with a "vGallery" effect on it. (Found by effect name.)
   b. Any layer literally named "vGALLERY CONTROLLER".
   c. Neither → create new shape layer named "vGALLERY CONTROLLER".
   If multiple controllers found, use the first; record warning.
3. Ensure FFX is on disk: write embedded bytes to ~/Library/Application Support/aeTools/vGallery/vGallery.ffx (always rewrite — `ensureFFX` does not size-check).
4. Ensure controller has the "vGallery" pseudo-effect:
   - If the controller already has an effect named "vGallery", leave it (preserves user values like Spacing, Visible Range, Fade Color).
   - Else: save current selection, `selectOnly(controller)`, `applyPreset(ffxFile)`, restore previous selection.
5. Ensure controller has the "vGallery Drop Shadow" effect:
   - If a "vGallery Drop Shadow" effect exists, leave it.
   - Else add ADBE Drop Shadow, rename to "vGallery Drop Shadow", set defaults: color black, opacity 50, direction 135°, distance 5, softness 0.
6. (Re)write Image Count + Total Length expressions on the "vGallery" pseudo-effect.
   Image Count uses case-insensitive "vg" prefix detection.
7. If selectedLayers.length === 0 → modal per the table above, return.
8. For each selected layer, run perLayerApply.
9. Build summary; show modal only if anything was skipped, auto-renamed, or warned.
```

### Controller bootstrap details

When creating the controller:
```
layer = comp.layers.addShape();
layer.name = "vGALLERY CONTROLLER";
layer.threeDLayer = true;
layer.transform.position.setValue([comp.width / 2, comp.height / 2, 0]);
layer.transform.xRotation.setValue(90);  // matches Phase 1 user setup
// scale stays at default [100, 100, 100]
// (no shape contents — effectively an invisible placeholder, like Phase 1's controller)
```

Then apply the FFX preset to register `vGallery`, then add
`vGallery Drop Shadow` effect.

### Per-layer Apply procedure

```
function perLayerApply(layer, results):
    if layer.locked:
        results.skipped.push({name: layer.name, reason: "locked"})
        return
    if layer instanceof CameraLayer || layer instanceof LightLayer:
        results.skipped.push({name: layer.name, reason: "unsupported layer type"})
        return
    if layer.adjustmentLayer === true:
        results.skipped.push({name: layer.name, reason: "adjustment layer"})
        return
    if layer.audioActive && !layer.hasVideo:
        results.skipped.push({name: layer.name, reason: "audio-only"})
        return

    // Auto-rename if needed
    if layer.name.toLowerCase().indexOf("vg") !== 0:
        var oldName = layer.name
        layer.name = "vG_" + oldName
        results.autoRenamed.push({from: oldName, to: layer.name})

    // Hard reset rig effects (each by exact name; user-added other effects survive)
    removeEffectByName(layer, "vGallery Travel Location")
    removeEffectByName(layer, "vGallery Tint")
    removeEffectByName(layer, "vGallery Drop Shadow")

    // Make 3D
    layer.threeDLayer = true

    // Add fresh effects
    var slider = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control")
    slider.name = "vGallery Travel Location"
    var tint = layer.property("ADBE Effect Parade").addProperty("ADBE Tint")
    tint.name = "vGallery Tint"
    var ds = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow")
    ds.name = "vGallery Drop Shadow"
    // Re-acquire references after each addProperty (per AE rule)

    // Set expressions (canonical strings from EXPRESSIONS.md, with "vGallery"
    // and "vG_" updated throughout)
    setExpression(slider("Slider"), TRAVEL_LOCATION_EXPR)
    setExpression(layer.transform.position, POSITION_EXPR)
    setExpression(tint("Map Black To"), FADE_COLOR_EXPR)
    setExpression(tint("Map White To"), FADE_COLOR_EXPR)
    setExpression(tint("Amount to Tint"), TINT_AMOUNT_EXPR)
    setExpression(ds("Shadow Color"), MASTER_SHADOW_COLOR_EXPR)
    setExpression(ds("Opacity"), MASTER_SHADOW_OPACITY_EXPR)
    setExpression(ds("Direction"), MASTER_SHADOW_DIRECTION_EXPR)
    setExpression(ds("Distance"), MASTER_SHADOW_DISTANCE_EXPR)
    setExpression(ds("Softness"), MASTER_SHADOW_SOFTNESS_EXPR)
    // Opacity left untouched (no expression, value preserved)

    results.rigged.push(layer.name)
```

The expression strings live in JSX as constants (mirroring `EXPRESSIONS.md`)
with the controller name interpolated dynamically — so if the controller was
detected by effect with a non-default layer name, the expressions reference
that actual name. Every Apply run rewrites every expression, so a renamed
controller is silently re-resolved.

### Failure containment

Wrap each `perLayerApply` body in try/catch. If layer N fails (e.g., AE
throws on `addProperty` because of some weird state), record:
```
results.skipped.push({name: layer.name, reason: "error: " + e.message})
```
and continue with layer N+1. Layers 1..N-1 remain rigged, undo group still
covers them as a unit.

## Remove Rig algorithm

```
1. Validate active item is a CompItem. Else: modal and return.
2. If selectedLayers.length === 0 → modal, return.
3. For each selected layer (inside a single "vGallery: Remove Rig" undo group):
     removeEffectByName(layer, "vGallery Travel Location")
     removeEffectByName(layer, "vGallery Tint")
     removeEffectByName(layer, "vGallery Drop Shadow")
     layer.transform.position.expression = ""
     // 3D toggle untouched
     // Layer name untouched (vG_ prefix kept)
4. No modal on success. Silent.
```

The controller is never modified by Remove Rig — even if the user removes
the rig from every layer, the controller stays for re-use.

## Production safeguards

- **Single undo group per click** for both Apply and Remove. One Cmd+Z
  reverts everything.
- **Atomic per-layer operations** wrapped in try/catch. Failed layers go to
  the skipped list with the error message; processing continues.
- **No layer locking during the script** (per `handoff/CLAUDE.md` ban-list).
- **No `app.scheduleTask` / no polling** — Apply is one-shot synchronous.
- **`selectOnly(layer)` before `applyPreset`** (per `handoff/CLAUDE.md` rule:
  target layer must be sole selection or AE creates a new Solid).
- **Restore selection after `applyPreset`** so user's selection is preserved.
- **Re-acquire property refs after every `addProperty`** (per AE rule:
  `addProperty` invalidates child refs).
- **Pre-flight build-time syntax check** on JSX via
  `cp VGalleryRig.jsx /tmp/check.js && node --check /tmp/check.js`. Plus
  extract each canonical expression string and `new Function()` each to catch
  expression-side parse errors before the JSX ships.
- **`ensureFFX` always rewrites** the cached FFX (per `handoff/CLAUDE.md`
  same-length-content lesson).
- **Version line** in JSX header, kept in lockstep with repo `VERSION` via
  `tools/bump_version.js`.

## ES3 / expression-engine constraints (reminder)

- ES3 only: `var`, `function` keyword, no `let`/`const`/arrow/template/destructuring.
- Brace BOTH branches of `if/else` in expressions.
- No `try/catch { }` with empty catch in expressions or runtime helpers.
- Use `add`/`sub`/`mul`/`length` vector helpers, never `+`/`-`/`*` on arrays.
- No `app.beginUndoGroup` inside per-layer try/catch — keep it at the outer
  Apply/Remove level.

## Out of scope

- Visual indicator on the controller layer (it stays an empty shape, like
  Phase 1).
- Auto-creating a camera (per user direction — no camera handling at all).
- Auto-creating a CAROUSEL VALUES GUIDE text layer (not used in current
  workflow; user removed it).
- Live state read-out in the panel ("X of Y rigged in this comp"). Status
  is action-driven only.
- Migration helper for legacy `imageRig-Gallery-*` layers in DreamOutdoor.
  User can re-Apply to migrate (auto-rename adds `vG_` prefix).
- "V Angle" snap to common values (90°, 180°). User can keyframe freely.
- Custom Bisector Rotation control. Removed in Phase 1; rotate the
  controller layer.

## Open questions

None blocking implementation.

## Test plan

Live testing via atom-ae MCP server in AE 2025:

1. **Fresh comp, no rig:**
   - Apply with no selection → controller created, modal shown.
   - Apply with one selected layer → controller created, layer rigged.
   - Verify controller has `vGallery` + `vGallery Drop Shadow` effects.
   - Verify image layer has `vGallery Travel Location`, `vGallery Tint`,
     `vGallery Drop Shadow`. Position expression set. Opacity untouched.
2. **Re-apply on already-rigged layer:** verify hard reset replaces effects;
   no duplicates.
3. **Apply on layer named `bg.png`:** auto-renamed to `vG_bg.png`; rigged;
   appears in auto-renamed list of summary modal.
4. **Apply on locked layer + camera + adjustment:** all skipped with reasons.
5. **Apply with mixed selection** (5 valid + 2 invalid + 1 needs rename):
   summary modal shows 6 rigged, 1 auto-renamed, 2 skipped.
6. **Remove Rig on rigged layer:** three effects gone, position expression
   cleared, name unchanged, 3D still on.
7. **Remove Rig on never-rigged layer:** no-op, no error.
8. **Renamed controller:** rename `vGALLERY CONTROLLER` → `Bob`, click Apply.
   Detection finds Bob by effect, updates all per-image expressions to
   reference `"Bob"`.
9. **Verify in viewport:** select rigged layer, scrub `Offset` on
   vGALLERY CONTROLLER's vGallery effect, confirm V geometry visible
   through camera.
10. **Cmd+Z after Apply:** single undo reverts all changes (effects gone,
    expressions cleared, layer renamed back, 3D off, controller deleted if
    we created it).
