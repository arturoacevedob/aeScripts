# vGallery — Claude Code instructions

V Gallery is a V-shape image carousel rig for After Effects. Ships as a
single-file dockable ScriptUI panel (`vGalleryRig.jsx`) with two buttons:
**Apply Rig** and **Remove Rig**. The pseudo-effect is hex-embedded into
the JSX (rendertom pattern).

**Status (2026-04-25):** v1.0.0 shipped. Apply / Remove both work end-to-end.
Live tested via atom-ae against fresh comps with mixed selections, locked
layers, cameras, adjustment layers, auto-rename cases, controller renaming,
and re-apply (hard reset).

## Where the rig lives

- **Deliverable:** `vGallery/vGalleryRig.jsx` (single file, embedded FFX bytes).
- **Source FFX:** `vGallery/vGallery.ffx` (binary, regenerated via
  `tools/embed_ffx.js` whenever the pseudo-effect definition changes).
- **Runtime FFX cache:** `~/Library/Application Support/aeTools/vGallery/vGallery.ffx`
  (script writes this on first run; AE's `applyPreset` registers the effect).

## Naming convention (locked)

| Thing | Name |
|---|---|
| Controller layer | `vGALLERY CONTROLLER` |
| Pseudo-effect group on controller | `vGallery` |
| Master Drop Shadow on controller | `vGallery Drop Shadow` |
| Renamed slider on each image layer | `vGallery Travel Location` |
| Renamed Tint on each image layer | `vGallery Tint` |
| Renamed Drop Shadow on each image layer | `vGallery Drop Shadow` |
| Image-layer prefix (case-insensitive at detection) | `vg_` |
| Auto-rename adds | `vG_` prefix |

The detection rule is `name.toLowerCase().indexOf("vg_") === 0`. The
underscore is required so the controller (`vGALLERY CONTROLLER`) doesn't
match itself.

## atom-ae MCP — how to inspect & modify

The `atom-ae` MCP server runs over HTTP inside AE's CEP extension. The port
shifts each AE launch — find it via `claude mcp list` or by probing CEP
listening ports. Tools are NOT in Claude Code's deferred pool — call
directly via curl JSON-RPC after initializing a session:

```bash
SID=<from initialize handshake>
curl -sS -m 8 -X POST "http://127.0.0.1:<port>/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":N,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```

Useful tools: `initialize_session`, `project_overview`, `list_layers`,
`get_expressions`, `scan_property_tree`, `get_properties`, `run_extendscript`
(auto-checkpoints), `revert_checkpoint`, `preview_frames`, `create_rig`.

**ExtendScript style:** ES3 only — `var`, `function` keyword, no `let`,
`const`, arrow, destructuring, template literals. Brace BOTH branches of
`if/else` in expressions. For runtime helpers, `propByMatchPath(layer, path)`
and `app.project.layerByID(id)` are injected by atom-ae.

See `handoff/CLAUDE.md` for the full set of AE expression-engine traps
that apply here too.

## JSX architecture

Single ES3 IIFE in `vGalleryRig.jsx`. All helpers are local; a debug handle
at `$.global.__vGalleryRig` exposes them for atom-ae testing during dev.

Section layout:
1. Constants (controller name, effect names, FFX paths)
2. Embedded FFX bytes between `// EMBED:BEGIN vgallery_ffx_binary` /
   `// EMBED:END vgallery_ffx_binary` markers.
3. `ensureFFX()` — decodes embedded bytes to disk.
4. Effect helpers — `findEffectByName`, `removeEffectByName`.
5. Selection helpers — `captureSelection`, `restoreSelection`, `selectOnly`.
6. Controller helpers — `findController`, `createController`,
   `ensureVGalleryEffect`, `ensureControllerDropShadow`,
   `writeAutoComputedExpressions`.
7. Per-image expression factory — `buildExpressions(ctrlName)`.
8. Per-layer rig application — `validateLayerForApply`, `autoRenameIfNeeded`,
   `setRigOnLayer`.
9. Orchestrators — `applyRig`, `removeRig`, `showApplySummaryIfNeeded`.
10. ScriptUI panel — buildUI + window mount.

## Per-layer expression set (canonical reference: EXPRESSIONS.md)

Every selected, validated, vG_-prefixed image layer gets:
- `vGallery Travel Location` Slider — path-position from `myIdx` and `Offset`
- `Transform/Position` — V geometry mapping via `ctrl.toWorld([x, y, 0])`
- `vGallery Tint` Map Black To, Map White To — bind to `Fade Color`
- `vGallery Tint` Amount to Tint — fade-from-apex ramp via `Visible Range`
- `vGallery Drop Shadow` Shadow Color, Opacity, Direction, Distance, Softness
  — bind to controller's master `vGallery Drop Shadow`

**Transform/Opacity has NO expression.** Deliberate. The user explicitly
wants opacity reserved for their own keyframing.

## Apply algorithm

Wraps everything in a single `app.beginUndoGroup("vGallery: Apply Rig")` so
Cmd+Z reverts the whole click. Skip-and-report failure model: invalid
layers go to a skipped list with reasons; valid layers proceed; modal at
end if anything was skipped, auto-renamed, or warned. Pure success runs
are silent.

Controller detection priority:
1. Any layer with a `vGallery` effect on it → use that, regardless of name.
2. Layer literally named `vGALLERY CONTROLLER`.
3. Neither → create new shape layer.

Per-layer Apply hard-resets first (deletes our three named effects if
present), then re-adds fresh. User-added effects with different names
survive.

## Don't

- **Don't add a `Transform/Opacity` expression.** User removed it twice
  during Phase 1; the apply script must not put it back.
- **Don't reference `CAROUSEL CONTROLLER`** in expressions — the layer was
  renamed to `vGALLERY CONTROLLER` during Phase 1.
- **Don't loop over `thisComp.numLayers`** in per-image Position/Tint
  expressions. Read `Image Count` and `Total Length` from the V Gallery
  group instead. Travel Location keeps its scan because it needs `myIdx`,
  but it exits early once self is found.
- **Don't recreate V Gallery** unless absolutely necessary. Recreating
  resets user values (Offset, Spacing, Visible Range, Fade Color). The
  apply script's `ensureVGalleryEffect` already skips re-adding when one
  is present.
- **Don't make the prefix `vg` without the underscore.** `vGALLERY CONTROLLER`
  starts with `vg`, so it would match itself and inflate Image Count by 1.
  The required prefix is `vg_`.

## Provisional naming history (pre-2026-04-25)

The original Phase 1 rig used different naming. Mapping:

| Provisional | Final |
|---|---|
| GALLERY CONTROLLER | vGALLERY CONTROLLER |
| V Gallery (effect) | vGallery |
| Travel Location (effect) | vGallery Travel Location |
| Tint (effect) | vGallery Tint |
| Drop Shadow (effect) | vGallery Drop Shadow |
| `image_` prefix | `vg_` (case-insensitive) |

To migrate any legacy rig in `DreamOutdoor`: re-Apply the new script on the
existing image layers (auto-renames to `vG_<oldname>` and rewrites all
expressions) or delete the legacy precomps in favor of dragged image
footage.

## File map

```
vGallery/
  CLAUDE.md           — this file
  README.md           — end-user docs
  EXPRESSIONS.md      — canonical expression source-of-truth
  vGalleryRig.jsx     — the shipped script
  vGallery.ffx        — source-of-truth pseudo-effect (hex-embedded into the JSX)
```

Process artifacts elsewhere in the repo:
- `docs/superpowers/specs/2026-04-24-v-gallery-rig-design.md` (Phase 1 design)
- `docs/superpowers/plans/2026-04-24-v-gallery-rig.md` (Phase 1 plan)
- `docs/superpowers/specs/2026-04-25-v-gallery-apply-script-design.md` (Phase 2 design)
- `docs/superpowers/plans/2026-04-25-v-gallery-apply-script.md` (Phase 2 plan)

## Conventions

- Single-file `.jsx` deliverable.
- Versioning: `Version: X.Y.Z` line in the header comment, kept in lockstep
  with repo `VERSION` via `tools/bump_version.js` (vGallery is registered
  in `JSX_TARGETS`).
- Embed pipeline: `tools/embed_ffx.js` re-runs after every `.ffx` edit;
  vGallery is registered in its `TARGETS` array (slug `vgallery`).
- Per-script README for end users; this CLAUDE.md for assistants.
- Never auto-commit. Only commit when explicitly asked.
