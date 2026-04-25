# V Gallery Rig — design

**Date:** 2026-04-24
**Target comp:** `DreamOutdoor-7440x3480` (id 1742)
**Target controller:** `CAROUSEL CONTROLLER` (id 1830) — existing rig in this comp

## Goal

Replace the current path-based gallery rig in `DreamOutdoor` with a V-shape rig.
Images flow along a V (apex in the middle, two legs splaying outward) instead of
along the `travel path` shape layer. Spacing between adjacent images is a
constant parameter — no longer derived from per-image card widths and no longer
normalized to a 0–100 cycle.

## Existing rig (what we're replacing)

`DreamOutdoor` currently uses a path-based carousel:

- **`CAROUSEL CONTROLLER`** carries the master `carousel travel` Slider (0–100)
  plus `exposure decay`, `opacity decay`, and `Soft Shadow Controller` effects.
- **`CAROUSEL VALUES GUIDE`** text layer auto-prints slider values that snap
  each image to the apex. Detection: `name.indexOf("image") === 0`.
- Each **`imageRig-Gallery-*`** precomp layer has a per-layer `Travel Location`
  Slider that adds the layer's index-derived offset to the master slider, mod 100.
- Each layer's **Position** calls `targetLayer.pointOnPath(progress)` against
  the `travel path` shape (currently disabled in panel but still referenced).
- Cycle is normalized to 100 slider units; spacing is `100 / N` (auto-computed).

The `Gallery-Linear-Rig` (comp id 913) is not the source of position math we
inherit — its core trick is `ctrl.toWorld([offset, 0, 0])`, which makes the
"line" implicit in the controller's transform. We adopt that pattern, but
bend the local axis into a V.

## New rig — architecture

The V is computed in `CAROUSEL CONTROLLER`'s local space. No path shape layer
is referenced. Move/rotate/scale the controller and the entire V follows.

### Controller effects (added to `CAROUSEL CONTROLLER`)

A new pseudo-effect group `V Gallery` with four top-level controls, replacing
the existing `carousel travel`:

| Control | Type | Default | Purpose |
|---|---|---|---|
| `Offset` | Slider | 0 | Master scroll, in spacing units. Integer values snap an image to the apex. Use negative values to reverse flow direction. |
| `Spacing` | Slider | 600 | Distance between adjacent images on the same leg, in controller-local units. Constant regardless of image count. |
| `V Angle` | Angle | 90° | Opening angle between the two legs. 180° collapses to a flat line. |
| `Bisector Rotation` | Angle | 0° | Direction the V's bisector points. 0° = legs point along controller-local +Y (downward in AE coords from apex). |

Existing `exposure decay`, `opacity decay`, and `Soft Shadow Controller`
effects on the controller stay untouched.

### Per-image layer expressions

Each `imageRig-Gallery-*` precomp layer keeps its `Travel Location` Slider
(now interpreted in spacing-units instead of percentage) and gets a new
Position expression. Opacity, tint, and shadow expressions are untouched.

**`Travel Location` Slider** — assigns each image a unique path-position:

```js
var ctrl = thisComp.layer("CAROUSEL CONTROLLER");
var spacing = ctrl.effect("V Gallery")("Spacing");
var offset  = ctrl.effect("V Gallery")("Offset");
var N = 0, myIdx = -1;
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf("image") === 0 && L.enabled) {
        if (L.index === index) myIdx = N;
        N++;
    }
}
if (myIdx < 0) value;
else {
    var totalLen = N * spacing;
    ((myIdx * spacing + offset) % totalLen + totalLen) % totalLen;
}
```

**`Position`** — maps path-position to V coordinates in controller-local space,
then to world:

```js
var ctrl = thisComp.layer("CAROUSEL CONTROLLER");
var spacing  = ctrl.effect("V Gallery")("Spacing");
var halfAng  = degreesToRadians(ctrl.effect("V Gallery")("V Angle") / 2);
var bisRot   = degreesToRadians(ctrl.effect("V Gallery")("Bisector Rotation"));

var p = effect("Travel Location")("Slider");
var N = 0;
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf("image") === 0 && L.enabled) N++;
}
var totalLen = N * spacing;
var halfLen  = totalLen / 2;

var d = p;
if (d > halfLen) d = d - totalLen;

var legSign = (d >= 0) ? 1 : -1;
var legDist = Math.abs(d);
var localX = legSign * legDist * Math.sin(halfAng);
var localY = legDist * Math.cos(halfAng);

var cosR = Math.cos(bisRot), sinR = Math.sin(bisRot);
var rotX = localX * cosR - localY * sinR;
var rotY = localX * sinR + localY * cosR;

ctrl.toWorld([rotX, rotY, 0]);
```

### `CAROUSEL VALUES GUIDE` text layer

Update its expression to print the integer-multiple-of-`Spacing` Offset values
that snap each image to the apex:

```js
var ctrl = thisComp.layer("CAROUSEL CONTROLLER");
var spacing = ctrl.effect("V Gallery")("Spacing");
var names = [];
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf("image") === 0 && L.enabled) names.push(L.name);
}
var N = names.length;
if (N === 0) "No image layers found";
else {
    var totalLen = N * spacing;
    var list = "Snap-to-apex Offset values:\n";
    for (var j = 0; j < N; j++) {
        var snap = ((-j * spacing) % totalLen + totalLen) % totalLen;
        list += names[j] + ": " + Math.round(snap) + "\n";
    }
    list += "\nSpacing: " + Math.round(spacing);
    list += "\nTotal length: " + Math.round(totalLen);
    list += "\nImage count: " + N;
    list;
}
```

(Image *i* sits at apex when `Offset = -i * Spacing` mod `N * Spacing`.)

## Behavior

- **Apex snapping:** `Offset = 0` puts image #0 at apex. `Offset = Spacing`
  puts image #1 at apex. Continuous values transition smoothly between.
- **Adding images:** legs grow outward; existing image positions don't
  re-shuffle (their indices in the layer order are preserved).
- **Cycle topology:** the path is a closed loop of length `N * Spacing`.
  - Apex sits at path-position 0 (and equivalently `N * Spacing`).
  - Right leg: path-position 0 → `N * Spacing / 2`.
  - Seam at `N * Spacing / 2`: right-leg-end teleports to left-leg-end.
  - Left leg: path-position `N * Spacing / 2` → `N * Spacing` (apex again).
- **Even-N seam:** when N is even and `Offset` is an integer multiple of
  `Spacing`, exactly one image sits at the seam (far end of one leg, where
  the wrap happens). This is acceptable; it matches the path-rig behavior.
- **Detection:** `name.indexOf("image") === 0`, case-sensitive. Matches
  existing `imageRig-Gallery-*` layers without renaming.

## Migration

1. Add the `V Gallery` pseudo-effect group to `CAROUSEL CONTROLLER`.
2. Rewrite `Travel Location` Slider expressions on all `imageRig-Gallery-*`
   layers (14 layers).
3. Rewrite Position expressions on the same layers.
4. Rewrite the `CAROUSEL VALUES GUIDE` text expression.
5. Verify in AE: scrub `Offset`, confirm images flow through apex; check that
   integer-multiple-of-Spacing values snap an image to apex.
6. Once verified, the legacy `carousel travel` Slider can be removed (or kept
   on the controller as a no-op if other compositions reference it).
7. Delete the `travel path` shape layer from `DreamOutdoor` once the new
   Position expressions are verified to no longer reference it.

## Out of scope

- Image rotation along the leg (images stay upright). Trivial to add later.
- Asymmetric V (different angle per leg). Use `V Angle` symmetrically for now.
- 3D V (legs into Z). The controller is a 3D layer in the existing comp;
  `toWorld([x, y, 0])` keeps the V flat in the controller's XY plane, which
  preserves the controller's existing 3D orientation.
- Smooth wrap at the seam. Teleport is intentional and matches the existing rig.
- Width-aware spacing (deliberate — the user wants constant spacing).

## Open questions for user

None blocking. Defaults below are conservative:

- Default `Spacing = 600`. The current `imageRig-Gallery-*` precomps are
  1920×1920 — 600 leaves clear visual gaps. User can crank this immediately.
- Default `V Angle = 90°` is a right-angle V. User can tune live.
- Default `Bisector Rotation = 0°` orients legs along controller +Y in
  controller-local space. Rotating the controller layer reorients the entire V
  without touching this control.
