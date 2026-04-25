# V Gallery Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the path-based gallery rig in the `DreamOutdoor-7440x3480` comp with a V-shape rig driven by a new `V Gallery` pseudo-effect on `CAROUSEL CONTROLLER`.

**Architecture:** All position math runs in `CAROUSEL CONTROLLER`'s local space via `ctrl.toWorld([x, y, 0])`. The "V" is implicit in the math (no path layer). Each `imageRig-Gallery-*` precomp layer gets a new Position expression that maps a path-position (driven by per-layer `Travel Location` Slider) onto V coordinates.

**Tech Stack:** After Effects 2025, ExtendScript (ES3-era), expression engine, atom-ae MCP server (HTTP at port 65230 for this session).

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-04-24-v-gallery-rig-design.md`
- Existing rig context: `handoff/CLAUDE.md` (atom-ae usage, ES3 traps, expression engine traps)

---

## Pre-flight

The atom-ae MCP server runs over HTTP at `http://127.0.0.1:65230/mcp`. Tools are not in Claude Code's deferred tool pool — call directly via curl JSON-RPC, with the `MCP-Session-Id` header from the initialize handshake. Pattern:

```bash
SID="<session-id>"
curl -sS -m 8 -X POST "http://127.0.0.1:65230/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":<n>,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```

If the session expires, re-`initialize` and re-send `notifications/initialized` per the MCP handshake.

**Key IDs (verify with `project_overview` if stale):**
- `DreamOutdoor-7440x3480` comp: id `1742`
- `CAROUSEL CONTROLLER` shape layer: id `1830`
- `CAROUSEL VALUES GUIDE` text layer: id `1831`
- `travel path` shape layer: id `1819`
- `imageRig-Gallery-*` precomp layers: ids `1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1845, 1846, 1847, 1848` (14 layers)

**ES3 / expression-engine reminders (from `handoff/CLAUDE.md`):**
- Use `var` only — no `let`/`const`/arrow/template-literal/destructuring/spread.
- Brace BOTH branches of `if/else` in expressions (parser is strict).
- Array `+`/`-`/`*` is broken on V8 expression engine; use `add`/`sub`/`mul`/`length` for vector ops, or operate component-wise.
- `addProperty` invalidates child refs — re-acquire after each call.
- Banned ExtendScript: empty `try/catch`, manual `beginUndoGroup` (atom-ae handles undo), `if (layer)` guards, locking layers.

---

## File / project mutation map

This plan modifies **the live AE project**, not files in this repo. After everything is verified, copy the final expressions into a project-companion artifact in this repo for future reference. The only repo files this plan creates are:

- **Create:** `docs/superpowers/specs/v-gallery-rig-expressions.md` — final committed expressions, for archival.
- **Modify (live AE):** `CAROUSEL CONTROLLER` (id 1830) — add `V Gallery` pseudo-effect group with 4 controls.
- **Modify (live AE):** 14 `imageRig-Gallery-*` layers — rewrite `Travel Location` slider expression, rewrite `Position` expression.
- **Modify (live AE):** `CAROUSEL VALUES GUIDE` text layer (id 1831) — rewrite Source Text expression.
- **Delete (live AE):** `travel path` shape layer (id 1819).

---

## Task 1: Add `V Gallery` pseudo-effect to CAROUSEL CONTROLLER

**Files / live AE:**
- Modify: `CAROUSEL CONTROLLER` (id 1830) — add effect group via atom-ae's `create_rig` tool.

- [ ] **Step 1: Verify current effect list on CAROUSEL CONTROLLER (baseline)**

Tool call: `scan_property_tree` with `compId=1742, layerIds=[1830], path="ADBE Effect Parade#1", depth=2, limit=50`.
Expected output: existing effects `carousel travel`, `exposure decay`, `opacity decay`, `Soft Shadow Controller` are listed. Capture the exact matchName ordinals so later expressions can target them precisely if needed.

- [ ] **Step 2: Apply `V Gallery` rig via atom-ae `create_rig`**

Tool call:

```json
{
  "name": "V Gallery",
  "layerId": 1830,
  "controls": [
    {"type": "slider", "name": "Offset",            "default": 0,   "min": -100000, "max": 100000},
    {"type": "slider", "name": "Spacing",           "default": 600, "min": 1,       "max": 5000},
    {"type": "angle",  "name": "V Angle",           "default": 90},
    {"type": "angle",  "name": "Bisector Rotation", "default": 0}
  ]
}
```

- [ ] **Step 3: Verify effect was added cleanly**

Tool call: `scan_property_tree` with `compId=1742, layerIds=[1830], path="ADBE Effect Parade#1", depth=2, limit=80`.
Expected: a new entry named `V Gallery` (Pseudo Effect) with four children — `Offset`, `Spacing`, `V Angle`, `Bisector Rotation`.

If `create_rig` failed because the rig already existed with the same id, append `2` to `name` and retry, or use `run_extendscript` to manually re-apply the FFX after deleting the old one.

- [ ] **Step 4: Sample default values to confirm they're set correctly**

Tool call: `get_properties` with `compId=1742, layerIds=[1830], query="V Gallery"`.
Expected: Offset=0, Spacing=600, V Angle=90, Bisector Rotation=0.

- [ ] **Step 5: Manual checkpoint commit (no git involved — atom-ae auto-checkpoints each run_extendscript call)**

No git commit. AE checkpoints are automatic via `run_extendscript`. Note the checkpoint id from the tool's response for potential rollback.

---

## Task 2: Rewrite `Travel Location` Slider expression on all `imageRig-Gallery-*` layers

**Files / live AE:**
- Modify: 14 layers, ids `1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1845, 1846, 1847, 1848` — `Travel Location` slider on each.

- [ ] **Step 1: Confirm matchName path of the `Travel Location` slider**

From the existing rig dump, the path is:
`ADBE Effect Parade#1/ADBE Slider Control#1/ADBE Slider Control-0001#1`
(i.e., the **first** `ADBE Slider Control` effect on each imageRig layer.)

Verify on one layer first via `scan_property_tree` with `compId=1742, layerIds=[1820], path="ADBE Effect Parade#1", depth=2, limit=20`. Expected: first slider effect is named `Travel Location`.

- [ ] **Step 2: Build the new expression string**

Final expression (paste verbatim into ExtendScript via concatenation; do NOT modify):

```js
var ctrl = thisComp.layer("CAROUSEL CONTROLLER");
var spacing = ctrl.effect("V Gallery")("Spacing");
var offset  = ctrl.effect("V Gallery")("Offset");
var N = 0, myIdx = -1;
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf("image") === 0 && L.enabled) {
        if (L.index === index) { myIdx = N; }
        N++;
    }
}
if (myIdx < 0) {
    value;
} else {
    var totalLen = N * spacing;
    ((myIdx * spacing + offset) % totalLen + totalLen) % totalLen;
}
```

- [ ] **Step 3: Pre-flight expression syntax check via `new Function`**

Run locally before sending to AE:
```bash
node -e "new Function(\`<paste the expression body here>\`); console.log('ok')"
```
Expected: `ok`. If syntax error reported, fix before sending.

- [ ] **Step 4: Apply via `run_extendscript`**

ExtendScript:

```js
var ids = [1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1845, 1846, 1847, 1848];
var expr = "" +
"var ctrl = thisComp.layer(\"CAROUSEL CONTROLLER\");\n" +
"var spacing = ctrl.effect(\"V Gallery\")(\"Spacing\");\n" +
"var offset  = ctrl.effect(\"V Gallery\")(\"Offset\");\n" +
"var N = 0, myIdx = -1;\n" +
"for (var i = 1; i <= thisComp.numLayers; i++) {\n" +
"    var L = thisComp.layer(i);\n" +
"    if (L.name.indexOf(\"image\") === 0 && L.enabled) {\n" +
"        if (L.index === index) { myIdx = N; }\n" +
"        N++;\n" +
"    }\n" +
"}\n" +
"if (myIdx < 0) {\n" +
"    value;\n" +
"} else {\n" +
"    var totalLen = N * spacing;\n" +
"    ((myIdx * spacing + offset) % totalLen + totalLen) % totalLen;\n" +
"}";
for (var k = 0; k < ids.length; k++) {
    var lyr = app.project.layerByID(ids[k]);
    var p = propByMatchPath(lyr, "ADBE Effect Parade#1/ADBE Slider Control#1/ADBE Slider Control-0001#1");
    p.expression = expr;
    $.writeln("Set Travel Location on " + lyr.name + " (id " + ids[k] + ")");
}
```

- [ ] **Step 5: Verify expressions applied on all 14 layers, no errors**

Tool call: `get_expressions` with `compId=1742, layerIds=[1820,1821,1822,1823,1824,1825,1826,1827,1828,1829,1845,1846,1847,1848], prop="Travel Location"`.
Expected: 14 layers grouped, each with the new expression. No `expression DISABLED` markers.

If `run_extendscript` reported `FAILED_MUTATIONS` or AE flagged an expression error, inspect the error, fix, and re-run. Use the checkpoint id to revert if needed.

- [ ] **Step 6: Sanity-sample one layer's value**

ExtendScript probe (read the slider's evaluated value at time 0 with current Offset=0):

```js
var lyr = app.project.layerByID(1820);
var p = propByMatchPath(lyr, "ADBE Effect Parade#1/ADBE Slider Control#1/ADBE Slider Control-0001#1");
$.writeln("Layer 1820 Travel Location at t=0: " + p.valueAtTime(0, false));
```
Expected: a number in `[0, 14*600) = [0, 8400)`. With Offset=0 and layer 1820 being layer index 7 (depends on current layer order), value should equal `myIdx * 600` for this layer. Cross-check: list_layers to find this layer's position among `image*` layers → expected value.

---

## Task 3: Rewrite `Position` expression on all `imageRig-Gallery-*` layers

**Files / live AE:**
- Modify: same 14 layers — `Transform/Position` on each.

- [ ] **Step 1: Build the new Position expression**

Final expression:

```js
var ctrl = thisComp.layer("CAROUSEL CONTROLLER");
var spacing  = ctrl.effect("V Gallery")("Spacing");
var halfAng  = degreesToRadians(ctrl.effect("V Gallery")("V Angle") / 2);
var bisRot   = degreesToRadians(ctrl.effect("V Gallery")("Bisector Rotation"));

var p = effect("Travel Location")("Slider");
var N = 0;
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf("image") === 0 && L.enabled) { N++; }
}
var totalLen = N * spacing;
var halfLen  = totalLen / 2;

var d = p;
if (d > halfLen) { d = d - totalLen; }

var legSign = (d >= 0) ? 1 : -1;
var legDist = Math.abs(d);
var localX = legSign * legDist * Math.sin(halfAng);
var localY = legDist * Math.cos(halfAng);

var cosR = Math.cos(bisRot);
var sinR = Math.sin(bisRot);
var rotX = localX * cosR - localY * sinR;
var rotY = localX * sinR + localY * cosR;

ctrl.toWorld([rotX, rotY, 0]);
```

- [ ] **Step 2: Pre-flight syntax check via `new Function`**

```bash
node -e "new Function(\`<paste expression>\`); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 3: Apply via `run_extendscript`**

ExtendScript (encode the expression as a JS string with `\n` line endings; example skeleton):

```js
var ids = [1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1845, 1846, 1847, 1848];
var expr = "" +
"var ctrl = thisComp.layer(\"CAROUSEL CONTROLLER\");\n" +
"var spacing  = ctrl.effect(\"V Gallery\")(\"Spacing\");\n" +
"var halfAng  = degreesToRadians(ctrl.effect(\"V Gallery\")(\"V Angle\") / 2);\n" +
"var bisRot   = degreesToRadians(ctrl.effect(\"V Gallery\")(\"Bisector Rotation\"));\n" +
"var p = effect(\"Travel Location\")(\"Slider\");\n" +
"var N = 0;\n" +
"for (var i = 1; i <= thisComp.numLayers; i++) {\n" +
"    var L = thisComp.layer(i);\n" +
"    if (L.name.indexOf(\"image\") === 0 && L.enabled) { N++; }\n" +
"}\n" +
"var totalLen = N * spacing;\n" +
"var halfLen  = totalLen / 2;\n" +
"var d = p;\n" +
"if (d > halfLen) { d = d - totalLen; }\n" +
"var legSign = (d >= 0) ? 1 : -1;\n" +
"var legDist = Math.abs(d);\n" +
"var localX = legSign * legDist * Math.sin(halfAng);\n" +
"var localY = legDist * Math.cos(halfAng);\n" +
"var cosR = Math.cos(bisRot);\n" +
"var sinR = Math.sin(bisRot);\n" +
"var rotX = localX * cosR - localY * sinR;\n" +
"var rotY = localX * sinR + localY * cosR;\n" +
"ctrl.toWorld([rotX, rotY, 0]);";
for (var k = 0; k < ids.length; k++) {
    var lyr = app.project.layerByID(ids[k]);
    var pos = propByMatchPath(lyr, "ADBE Transform Group#1/ADBE Position#1");
    pos.expression = expr;
    $.writeln("Set Position on " + lyr.name + " (id " + ids[k] + ")");
}
```

- [ ] **Step 4: Verify all 14 expressions applied without error**

Tool call: `get_expressions` with `compId=1742, layerIds=[<all 14>], prop="ADBE Transform Group#1/ADBE Position#1"`.
Expected: all 14 layers grouped with the new expression. No `expression DISABLED`.

- [ ] **Step 5: Probe known-value cases**

ExtendScript probe (with `Offset=0, Spacing=600, V Angle=90, Bisector Rotation=0, Direction=1`):

```js
var ctrl = app.project.layerByID(1830);
var ctrlPos = ctrl.transform.position.value;
$.writeln("ctrl world position: " + ctrlPos.toString());

var ids = [1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1845, 1846, 1847, 1848];
for (var k = 0; k < ids.length; k++) {
    var lyr = app.project.layerByID(ids[k]);
    var pv = lyr.transform.position.valueAtTime(0, false);
    $.writeln(k + ": " + lyr.name + " (id " + ids[k] + ") pos=" + pv.toString());
}
```

Expected (with halfAng = 45°, sin=cos≈0.7071, totalLen=14*600=8400, halfLen=4200):
- Image at `myIdx=0` (whichever layer is first in `image*` order) → `p=0`, `d=0`, position = ctrl.toWorld([0,0,0]) = ctrl's world position itself.
- Image at `myIdx=1` → `p=600`, `d=600`, legSign=1, localX=600*sin(45°)≈424.26, localY=600*cos(45°)≈424.26. Position offset (relative to ctrl in local) = [424.26, 424.26, 0].
- Image at `myIdx=7` → `p=4200`, `d=4200=halfLen`. Edge case: `d > halfLen` is false (equal), so d stays 4200. legSign=1, localX≈2969.85, localY≈2969.85. (This is the "seam" image; it sits at far-end of the right leg with halfAng=45°.)
- Image at `myIdx=8` → `p=4800`, `d=4800-8400=-3600`. legSign=-1, localX=-3600*sin(45°)≈-2545.58, localY=3600*cos(45°)≈2545.58.

Confirm at least 2 images match expected to within 0.1px.

- [ ] **Step 6: Visual scrub — capture preview frames at Offset=0, 200, 400, 600**

Use atom-ae `preview_frames` with `compId=1742, count=4`. (Or set `Offset` keyframes spanning the time range and let preview_frames sample.)

Easier: use ExtendScript to set Offset=600 (one full step) and then capture another preview frame to verify image 1 is now at apex.

Expected: at Offset=0 the layer with `myIdx=0` sits at the apex (controller's world position). At Offset=600, the layer with `myIdx=1` should be at apex; previously-apex layer (`myIdx=0`) should be at distance 600 along whichever leg corresponds to `Direction=1` (right leg).

If positions look wrong but math probe passed, the user can either set negative `Offset` to reverse flow, or rotate the controller 180° via `Bisector Rotation` to mirror the V.

---

## Task 4: Update `CAROUSEL VALUES GUIDE` text expression

**Files / live AE:**
- Modify: `CAROUSEL VALUES GUIDE` (id 1831) — `Source Text` property.

- [ ] **Step 1: Build the new expression**

```js
var ctrl = thisComp.layer("CAROUSEL CONTROLLER");
var spacing = ctrl.effect("V Gallery")("Spacing");
var names = [];
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.indexOf("image") === 0 && L.enabled) { names.push(L.name); }
}
var N = names.length;
if (N === 0) {
    "No image layers found";
} else {
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

- [ ] **Step 2: Pre-flight syntax check**

`new Function`-validate locally; expected `ok`.

- [ ] **Step 3: Apply via `run_extendscript`**

```js
var lyr = app.project.layerByID(1831);
var src = propByMatchPath(lyr, "ADBE Text Properties#1/ADBE Text Document#1");
src.expression = "" +
"var ctrl = thisComp.layer(\"CAROUSEL CONTROLLER\");\n" +
"var spacing = ctrl.effect(\"V Gallery\")(\"Spacing\");\n" +
"var names = [];\n" +
"for (var i = 1; i <= thisComp.numLayers; i++) {\n" +
"    var L = thisComp.layer(i);\n" +
"    if (L.name.indexOf(\"image\") === 0 && L.enabled) { names.push(L.name); }\n" +
"}\n" +
"var N = names.length;\n" +
"if (N === 0) {\n" +
"    \"No image layers found\";\n" +
"} else {\n" +
"    var totalLen = N * spacing;\n" +
"    var list = \"Snap-to-apex Offset values:\\n\";\n" +
"    for (var j = 0; j < N; j++) {\n" +
"        var snap = ((-j * spacing) % totalLen + totalLen) % totalLen;\n" +
"        list += names[j] + \": \" + Math.round(snap) + \"\\n\";\n" +
"    }\n" +
"    list += \"\\nSpacing: \" + Math.round(spacing);\n" +
"    list += \"\\nTotal length: \" + Math.round(totalLen);\n" +
"    list += \"\\nImage count: \" + N;\n" +
"    list;\n" +
"}";
$.writeln("Set CAROUSEL VALUES GUIDE source text expression");
```

- [ ] **Step 4: Verify expression applied**

Tool call: `get_expressions` with `compId=1742, layerIds=[1831]`.
Expected: the new expression in place. No DISABLED flag.

- [ ] **Step 5: Spot-check the rendered text**

ExtendScript:
```js
var lyr = app.project.layerByID(1831);
var src = propByMatchPath(lyr, "ADBE Text Properties#1/ADBE Text Document#1");
var doc = src.valueAtTime(0, false);
$.writeln("Rendered text: \n" + doc.text);
```
Expected: 14 lines with `imageRig-Gallery-N: <integer>` plus footer "Spacing: 600 / Total length: 8400 / Image count: 14".

---

## Task 5: End-to-end verification

**Files / live AE:** No mutations — read-only checks.

- [ ] **Step 1: Visual spot-check via `preview_frames`**

Tool call: `preview_frames` with `compId=1742, count=4`. With Offset=0 default, capture a frame at the comp's `displayStartTime` (or t=0 if available).

Expected: 14 imageRig precomps arranged in a V symmetric about the CAROUSEL CONTROLLER's world position. Some images will be far off the visible canvas given Spacing=600 and 14 images — this is fine; the user will tune Spacing/V Angle live.

- [ ] **Step 2: Scrub Offset and verify motion**

ExtendScript:
```js
var ctrl = app.project.layerByID(1830);
var off = propByMatchPath(ctrl, "ADBE Effect Parade#1/(Pseudo)/(Offset)#1");
// ^ matchName for the V Gallery group + Offset child must come from Task 1 Step 3
off.setValueAtTime(0, 0);
off.setValueAtTime(2, 600);
$.writeln("Animated Offset 0→600 over 2s");
```

Then `preview_frames` over the [0, 2] range. Expected: image with `myIdx=0` slides off the apex toward the right leg; image with `myIdx=1` slides into the apex.

If the direction looks wrong (image 1 leaves apex instead of arriving), set `Offset` to a negative value (`-600` instead of `+600`) — re-render — confirm direction.

- [ ] **Step 3: Edge-case probe — adding a new image**

ExtendScript:
```js
var comp = app.project.itemByID(1742);
var newLyr = comp.layers.add(app.project.layerByID(1820).source);
newLyr.name = "imageRig-Gallery-99";
$.writeln("Added test layer: " + newLyr.name + " (id " + newLyr.id + ") at index " + newLyr.index);
```

Then verify: `CAROUSEL VALUES GUIDE` updates to N=15. Each existing imageRig's `Travel Location` shifts because totalLen changed. Position expressions still evaluate without error.

After verifying, **delete the test layer** to keep the comp clean:
```js
app.project.layerByID(<newLyrId>).remove();
```

- [ ] **Step 4: Edge-case probe — V Angle = 0 and V Angle = 180**

Set V Angle to 0° via ExtendScript, sample positions, confirm all images collapse onto the bisector axis (legs overlap). Then set V Angle = 180°, sample, confirm legs are now flat — all images on a horizontal line through the apex.

Reset V Angle to 90° afterward.

---

## Task 6: Cleanup

**Files / live AE:**
- Delete: `travel path` shape layer (id 1819).
- Optionally remove or rename the legacy `carousel travel` Slider on CAROUSEL CONTROLLER.

- [ ] **Step 1: Confirm no remaining references to `travel path`**

Tool call: `get_expressions` with `compId=1742`. Search the dump for the string `travel path`. Expected: zero matches after Task 3 has rewritten Position expressions.

If a match remains, do not delete the layer — investigate which expression still references it and fix first.

- [ ] **Step 2: Delete the `travel path` layer**

```js
app.project.layerByID(1819).remove();
$.writeln("Removed travel path layer");
```

- [ ] **Step 3: Decide on legacy `carousel travel` Slider**

Search the project for any reference: tool call `search_project` with `query="carousel travel"`. If only `DreamOutdoor` references it (which after this plan should be zero), remove the slider:

```js
var ctrl = app.project.layerByID(1830);
var fx = propByMatchPath(ctrl, "ADBE Effect Parade#1/ADBE Slider Control#1");
// confirm name first:
if (fx.name === "carousel travel") { fx.remove(); $.writeln("Removed legacy carousel travel slider"); }
else { $.writeln("Skip — first slider is " + fx.name); }
```

If any other comp still references it, leave it in place — it does no harm.

- [ ] **Step 4: Save the AE project**

User saves manually in AE (`Cmd+S`). No tool call — atom-ae does not save the project.

---

## Task 7: Archive expressions to repo

**Files:**
- Create: `docs/superpowers/specs/v-gallery-rig-expressions.md`

- [ ] **Step 1: Write the archive doc**

Create the file with the four final expressions (Travel Location slider, Position, CAROUSEL VALUES GUIDE source text — and no expression on V Gallery group itself, just the slider defaults). Use the verbatim content from Tasks 2/3/4 Step 1.

This file is a reference for future-Claude or future-Arturo: if the rig breaks or needs porting to another comp, these are the canonical expressions.

- [ ] **Step 2: User commits manually**

No automatic git commit (per `aeTools/CLAUDE.md`: "Never auto-commit"). Notify the user with the list of changed files: spec, plan, and archive doc.

---

## Self-review

**Spec coverage:**
- ✅ V Gallery pseudo-effect with Offset/Spacing/V Angle/Bisector Rotation → Task 1.
- ✅ Per-layer Travel Location expression → Task 2.
- ✅ Per-layer Position expression → Task 3.
- ✅ CAROUSEL VALUES GUIDE rewrite → Task 4.
- ✅ Detection rule `name.indexOf("image") === 0` → Tasks 2/3/4 use it consistently.
- ✅ Cycle topology / seam → encoded in Task 3 expression; Task 5 Step 4 probes V Angle edge cases.
- ✅ Migration steps in spec → mapped to Tasks 1–6.
- ✅ `travel path` deletion → Task 6.

**Placeholder scan:** None. All expressions are complete; all ExtendScript shows real code; no "implement later."

**Type / name consistency:** Effect group named exactly `V Gallery` everywhere. Sub-controls match: `Offset`, `Spacing`, `V Angle`, `Bisector Rotation`. Detection rule `name.indexOf("image") === 0` identical in all three expressions. Layer-id list `[1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1845, 1846, 1847, 1848]` matches the 14 imageRig layers from `list_layers`. Variable names `myIdx`, `totalLen`, `halfLen`, `halfAng`, `bisRot`, `legSign`, `legDist`, `localX`, `localY`, `rotX`, `rotY` — consistent across Tasks 2 and 3.

One known fuzzy point: the matchName for `V Gallery` group's `Offset` child needs to be confirmed in Task 1 Step 3 before Task 5 Step 2 can target it via `propByMatchPath`. If the actual matchName differs from the Pseudo Effect Maker default (typically `Pseudo/(name)#1`), Task 5 Step 2 must use `ctrl.effect("V Gallery")("Offset")` from ExtendScript instead — which works either way because the `effect()` lookup is by display name.
