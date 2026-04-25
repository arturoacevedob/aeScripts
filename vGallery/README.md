# vGallery

A V-shape image carousel rig for After Effects. Distributes any number of
images along the two legs of a V, with a single `Offset` slider that scrolls
the apex through the sequence. Ships as a dockable ScriptUI panel.

## Install

1. Copy `vGalleryRig.jsx` into your AE Scripts/ScriptUI Panels folder:
   - macOS: `~/Documents/Adobe/After Effects 2025/Scripts/ScriptUI Panels/`
   - (Adjust for your AE version.)
2. Restart After Effects.
3. Open via `Window > vGalleryRig.jsx`. Dock the panel where you want.

## Use

1. Drag image footage into a comp. Convention: name files
   `vG_firstname_lastname` (any case is fine — the script auto-prepends `vG_`
   if the prefix is missing).
2. Select the layers you want on the rig.
3. Click **Apply Rig** in the panel.
   - First click in a comp: a `vGALLERY CONTROLLER` shape layer is auto-created
     and the rig effects are applied to your selected layers.
   - Subsequent clicks: any new selected layers get the rig; already-rigged
     layers get a hard reset (effects re-added fresh).
4. Tune the rig from the controller's `vGallery` effect group — see Controls
   below.

To unrig: select layers, click **Remove Rig**.

## Controls (on `vGALLERY CONTROLLER → vGallery`)

| Control | Default | Purpose |
|---|---|---|
| `Offset` | `0` | Image-index of the layer at the apex. `Offset = 5` showcases image #5. Stable across N — image 5 stays as image 5 even when more images are added. |
| `Spacing` | `600` | Distance between adjacent images on the same leg, in controller-local units. |
| `V Angle` | `90°` | Opening angle between the two legs. `0°` collapses onto a single line; `180°` flattens to a horizontal line. To rotate the V to a different orientation, rotate the **controller layer itself**. |
| `Visible Range` | `5` | How many images per leg are visible before the fade-out completes. Beyond this, images fully tint to `Fade Color`. |
| `Fade Color` | black | Color images fade into at the visible-range boundary. Drives Tint Map Black/White on every image layer. |

A second effect on the controller, `vGallery Drop Shadow` (a vanilla AE Drop
Shadow), drives the drop shadow on every image layer at once — Shadow Color,
Opacity, Direction, Distance, and Softness are all linked. `Shadow Only` is
**not** linked (per-layer override).

### Read-only data sliders

Two auto-computed sliders inside `vGallery` show the live state:

- `Image Count` — number of `vg_*` layers currently in the comp.
- `Total Length` — `Image Count × Spacing` (the cycle length in path units).

Don't drag these — they're driven by expressions.

## Layer naming

Detection: enabled layers whose name (lowercased) starts with `vg_`. Matches
`vG_jane.png`, `VG_paris.jpg`, `vg_test.mov`, etc. Auto-rename on Apply
prepends `vG_` (consistent casing) when the prefix is missing.

Disabling a layer in the timeline removes it from the rig — `Image Count`
recomputes and the V re-spaces automatically.

## What gets applied per-layer

Apply enables 3D and adds three named effects to each selected layer:

- `vGallery Travel Location` (renamed `ADBE Slider Control`) — holds the
  layer's path-position.
- `vGallery Tint` (renamed `ADBE Tint`) — fade-into-color.
- `vGallery Drop Shadow` (renamed `ADBE Drop Shadow`) — linked to the
  controller's master.

The layer's `Transform/Position` gets a V-geometry expression. **Opacity is
left untouched** — it's reserved for your own keyframing.

## Files

- `vGalleryRig.jsx` — the deliverable script
- `vGallery.ffx` — source-of-truth pseudo-effect, embedded into the JSX
- `EXPRESSIONS.md` — canonical expressions for every property the rig touches
- `CLAUDE.md` — context for AI assistants in future sessions
