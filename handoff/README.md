# Handoff

Weighted, switchable, sticky dynamic parenting for After Effects.

## What it does

Pick up to 5 parent layers and a per-parent weight (0..1). When a weight is
non-zero, the rigged layer **inherits that parent's motion in world space** —
position, rotation, and scale, frame to frame. When you ease a weight back to 0
the layer **keeps the offset it accumulated and stops inheriting**; it does
NOT snap back to its rest position.

This is the "stays where it was" property motion designers expect for
hand-offs. Classic example: an apple parented to the left hand, handed off to
the right hand mid-shot. With Handoff you fade the left-hand weight to 0 and
the right-hand weight to 1; the apple inherits left-hand motion during the
fade-out, then right-hand motion during the fade-in, and ends up correctly
attached to the right hand without any popping.

This is **velocity inheritance**, not positional blending. If you wanted the
layer to *snap* to the parent's current position when weight goes to 1, that
is a different rig (a Look-At / Track-To constraint) and not what this script
does.

## Install

Drop `Handoff.jsx` into After Effects' ScriptUI Panels folder:

- **macOS**: `~/Library/Application Support/Adobe/After Effects <version>/Scripts/ScriptUI Panels/`
- **Windows**: `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`

Restart After Effects. The panel appears under `Window → Handoff.jsx`. Dock it
anywhere.

> No pseudo-effect install needed. The script creates all required expression
> controls programmatically on each layer it rigs. Works on any AE install
> with no `PresetEffects.xml` editing.

## Use

1. Select one or more layers in your comp.
2. Click **Handoff**. The script attaches expressions to Position, Rotation,
   and Scale, and adds 26 expression controls to the layer:
   - `Layer 1..5` — layer pickers for the parents
   - `Weight 1..5` — shared weight slider per parent (0..1)
   - `Use Individual Weights` — checkbox; off by default
   - `Pos Weight 1..5`, `Rot Weight 1..5`, `Scale Weight 1..5` — per-channel
     weights, used only when the checkbox is on
3. Drop the parent layers into the `Layer N` slots and animate `Weight N` to
   hand off between them.
4. To remove the rig, click the **✕** button. It clears the expressions and
   removes all 26 controls.

### Shared vs individual weights

By default, `Weight N` controls position, rotation, and scale together for
parent N — the simple case. Toggle **Use Individual Weights** to drive each
channel independently from the per-channel sliders. Useful when you want a
parent to lend its position but not its rotation, or vice versa.

## How the math works

Each frame, the expression computes the *incremental* contribution from the
previous frame and adds it to the accumulator stored in the property's
previous-frame value:

```
offset(t) = offset(t - dt) + Σ_parents  weight(t) · Δworld_transform
```

The previous frame's accumulator is recovered via:

```javascript
thisProperty.valueAtTime(t - dt) - thisProperty.valueAtTime(t - dt, true)
```

The second call returns the *pre-expression* value (the layer's own keyframed
value at that time). This separates "the layer's animated value" from "what
this expression has added to it."

This gives **O(1) work per frame and O(frames) total render cost**. The
naive integration approach (recompute `∫₀ⁿᵒʷ` every frame) is O(frames²).

- **Position** integrates as additive world-space vectors via `toWorld()`.
- **Rotation** integrates as additive degrees, derived from the angle of a
  parent-local unit vector after `toWorld()`. Wraparound (359° → 1°) is
  corrected by clamping the per-frame delta to ±180°.
- **Scale** integrates as a multiplicative ratio per axis, derived from the
  length of parent-local basis vectors after `toWorld()`. Combined in log
  space inside the accumulator so multiple parents combine cleanly, then
  exponentiated back at output.

All three expressions use AE's `add` / `sub` / `mul` / `length` vector helpers
and are compatible with both the **Legacy** and **V8** expression engines.

## Limitations

- **Comp must start at time 0.** The expressions assume `t=0` is the
  reference state. If your work area starts later, the rig still works but
  the "rest position" is the layer's value at frame 0.
- **Scale is unsigned.** Flipped layers (negative scale) are not handled
  correctly because we extract scale from `length()` of basis vectors.
- **Rotation is 2D only.** The script attaches to `ADBE Rotate Z`. For 3D
  layers with X/Y/Z rotation, only Z is rigged.
- **Recursive `valueAtTime`** can have a one-time walkback cost when scrubbing
  cold frames. After the cache warms up, subsequent frames are O(1).
- **Time remapping and looping comps** may break the recursive accumulator
  because they violate the "previous frame is the temporal predecessor"
  assumption.

## History

The original Handoff script integrated weight × velocity over the entire
timeline on every single frame, with O(frames²) total render cost and a
correctness bug under the V8 expression engine (array `+`/`-`/`*` operators
don't work in V8). This rewrite uses recursive-delta accumulation for O(frames)
cost, fixes the V8 bug, and extends the rig to cover rotation and scale in
addition to position. See the git log for the full diff.
