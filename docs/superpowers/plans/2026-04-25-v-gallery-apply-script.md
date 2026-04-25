# vGallery Apply Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `vGallery/vGalleryRig.jsx` — a single-file dockable ScriptUI panel that applies the vGallery rig to selected layers in After Effects with production-grade reliability, plus a Remove Rig button.

**Architecture:** Single ES3 ExtendScript IIFE. Pseudo-effect FFX embedded as hex-escaped bytes between `// EMBED:BEGIN` / `// EMBED:END` markers (rendertom pattern, identical to `Handoff.jsx`). On first run, decoded bytes are written to `~/Library/Application Support/aeTools/vGallery/vGallery.ffx` and registered via `applyPreset(file)`. All testing is live in AE 2025 via the atom-ae MCP server.

**Tech Stack:** ExtendScript (ES3-era), AE pseudo-effects, ScriptUI, atom-ae MCP server for testing, repo's existing `tools/embed_ffx.js` and `tools/bump_version.js`.

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-04-25-v-gallery-apply-script-design.md`
- Phase 1 rig context: `vGallery/CLAUDE.md`, `vGallery/EXPRESSIONS.md` (uses provisional naming; will be updated in Task 19)
- AE expression-engine traps and ExtendScript style: `handoff/CLAUDE.md`

---

## Pre-flight conventions for the engineer executing this plan

**ES3 only.** No `let`, `const`, arrow, template literals, destructuring, classes, async/await, Promises. Use `var`, `function` keyword, traditional `for` loops, string concat with `+`. Brace BOTH branches of `if/else` in expressions.

**Atom-ae MCP** is the test harness. The HTTP port shifts each AE launch — the user knows it. Tests are not in Claude Code's deferred pool; call directly via curl JSON-RPC with the `MCP-Session-Id` header from `initialize`. Pattern:
```bash
SID=<session-id-from-initialize>
curl -sS -m 8 -X POST "http://127.0.0.1:<port>/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":N,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```

**Test fixture comp:** create a fresh comp named `vGallery-test` (1920×1080, 30fps, 10s) at the start of testing tasks. Re-use it across tasks. ID it via `project_overview`.

**Each task ends with `node --check`** on the JSX to catch parse errors before sending to AE. Run:
```bash
cp "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx" /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```

**Never auto-commit.** Per repo `CLAUDE.md`: only commit when explicitly asked.

---

## File map

**Created in this plan:**
- `vGallery/vGalleryRig.jsx` — the deliverable
- `vGallery/vGallery.ffx` — source-of-truth pseudo-effect (bytes embedded into the JSX)

**Modified in this plan:**
- `tools/embed_ffx.js` — add vGallery target
- `tools/bump_version.js` — add vGallery to `JSX_TARGETS`
- `vGallery/CLAUDE.md` — update naming from provisional to final
- `vGallery/README.md` — same
- `vGallery/EXPRESSIONS.md` — same

**Untouched:**
- The user's live AE project (the new script can be tested against fresh comps; the existing `DreamOutdoor` rig remains functional with provisional naming until the user re-Applies).

---

## Task 1: Generate `vGallery/vGallery.ffx`

**Files:**
- Create: `vGallery/vGallery.ffx`

This task is operator-driven (interactive in AE) — the engineer can't fully automate it. The output is one binary file in the repo.

- [ ] **Step 1: Open AE, ensure atom-ae MCP is running**

Confirm via `claude mcp list` or the user's running AE session. Note the HTTP port for atom-ae.

- [ ] **Step 2: Create the V Gallery effect on a temp layer via atom-ae**

```bash
SID="<your session id>"
PORT="<your atom-ae port>"

# Initialize a session if needed
curl -sS -X POST "http://127.0.0.1:$PORT/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"plan","version":"1.0"}}}'

# Make a fresh comp + null, then create_rig on the null
curl -sS -X POST "http://127.0.0.1:$PORT/mcp" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_extendscript","arguments":{"code":"var c=app.project.items.addComp(\"ffx-export\",1920,1080,1,10,30); c.openInViewer(); var n=c.layers.addNull(); n.name=\"FFX_TEMP\"; $.writeln(\"comp=\"+c.id+\" layer=\"+n.id);"}}}'
```

Note the layer id from the output.

- [ ] **Step 3: Create the rig**

```bash
curl -sS -X POST "http://127.0.0.1:$PORT/mcp" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_rig","arguments":{"name":"vGallery","layerId":<LAYER_ID>,"controls":[{"type":"group","name":"// CONTROLS","children":[]},{"type":"slider","name":"Offset","default":0,"min":-100,"max":100},{"type":"slider","name":"Spacing","default":600,"min":1,"max":5000},{"type":"angle","name":"V Angle","default":90},{"type":"slider","name":"Visible Range","default":5,"min":0,"max":20},{"type":"color","name":"Fade Color","default":[0,0,0]},{"type":"group","name":" ","children":[]},{"type":"group","name":"// DATA","children":[]},{"type":"slider","name":"Image Count","default":0,"min":0,"max":1000},{"type":"slider","name":"Total Length","default":0,"min":0,"max":1000000},{"type":"group","name":"  ","children":[]},{"type":"group","name":"// Conjured with love","children":[]},{"type":"group","name":"// at The Heist.","children":[]}]}}}'
```

- [ ] **Step 4: Save the effect group as an Animation Preset via the AE UI**

Manual UI step in AE:
1. Select the `FFX_TEMP` null layer.
2. In the Effect Controls panel, click on the `vGallery` effect group's name (highlights the group).
3. Menu: `Animation > Save Animation Preset...`
4. In the save dialog, navigate to the repo's `vGallery/` folder.
5. Filename: `vGallery.ffx`. Save.

- [ ] **Step 5: Verify the file was created**

```bash
ls -la "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGallery.ffx"
```
Expected: file exists, non-zero size (typically 2–10 KB for a small pseudo-effect).

- [ ] **Step 6: Clean up the temp comp**

```bash
curl -sS -X POST "http://127.0.0.1:$PORT/mcp" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"run_extendscript","arguments":{"code":"for(var i=app.project.numItems;i>=1;i--){var it=app.project.item(i); if(it.name===\"ffx-export\")it.remove();}"}}}'
```

---

## Task 2: Skeleton JSX (no functionality yet)

**Files:**
- Create: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Write the skeleton**

```javascript
// vGalleryRig.jsx — V-shape gallery rig applier for After Effects
// Version: 1.0.0
//
// Drop into After Effects' Scripts/ScriptUI Panels/ folder, restart AE,
// open via Window menu. See vGallery/README.md for usage.
//
// Conjured with love at The Heist.

(function (thisObj) {

    var VERSION = "1.0.0";

    var CTRL_DEFAULT_NAME    = "vGALLERY CONTROLLER";
    var EFFECT_VGALLERY      = "vGallery";
    var EFFECT_VG_DROP_SHADOW = "vGallery Drop Shadow";
    var EFFECT_VG_TRAVEL_LOC = "vGallery Travel Location";
    var EFFECT_VG_TINT       = "vGallery Tint";
    var LAYER_PREFIX_LOWER   = "vg";
    var LAYER_AUTORENAME_PREFIX = "vG_";

    var FFX_INSTALL_DIR = Folder.userData.fsName + "/aeTools/vGallery";
    var FFX_FILENAME    = "vGallery.ffx";

    var FFX_HEX = "" +
        // EMBED:BEGIN
        "" +
        // EMBED:END
        "";

    // ----- ScriptUI panel -----

    function buildUI(parent) {
        var grp = parent.add("group");
        grp.orientation = "column";
        grp.alignChildren = ["fill", "top"];
        grp.spacing = 6;
        grp.margins = 8;

        var ver = grp.add("statictext", undefined, "v" + VERSION);
        ver.graphics.foregroundColor = ver.graphics.newPen(ver.graphics.PenType.SOLID_COLOR, [0.5, 0.5, 0.5, 1], 1);

        var btnApply = grp.add("button", undefined, "Apply Rig");
        var btnRemove = grp.add("button", undefined, "Remove Rig");

        btnApply.onClick = function () {
            alert("Apply Rig — not implemented yet.");
        };
        btnRemove.onClick = function () {
            alert("Remove Rig — not implemented yet.");
        };

        if (parent instanceof Window) {
            parent.layout.layout(true);
        }
    }

    var win = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", "vGallery", undefined, { resizeable: true });
    buildUI(win);
    if (win instanceof Window) {
        win.center();
        win.show();
    }

})(this);
```

- [ ] **Step 2: Syntax check**

```bash
cp "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx" /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```
Expected: no output (parse OK). Any error here means the skeleton has a typo.

- [ ] **Step 3: Live load test**

Via atom-ae `run_extendscript`:
```javascript
var f = new File("/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx");
$.evalFile(f);
$.writeln("loaded ok");
```
Expected: a floating "vGallery" palette appears in AE; diagnostic prints `loaded ok`.

Close the floating palette before next task (the IIFE creates it on every `evalFile`).

---

## Task 3: Wire `tools/embed_ffx.js` to embed `vGallery.ffx`

**Files:**
- Modify: `tools/embed_ffx.js`

- [ ] **Step 1: Read current tool**

Read `tools/embed_ffx.js` to find `EMBED_TARGETS` array (or equivalent). Confirm the existing handoff entry's structure.

- [ ] **Step 2: Add vGallery entry**

Add to `EMBED_TARGETS` (exact key names follow the handoff pattern in the file):
```javascript
{
    ffx: "vGallery/vGallery.ffx",
    jsx: "vGallery/vGalleryRig.jsx",
    label: "vGallery"
}
```

- [ ] **Step 3: Run embed**

```bash
node "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/tools/embed_ffx.js"
```
Expected output: log line confirming vGallery FFX was embedded; diff shows `FFX_HEX` block in the JSX is now non-empty.

- [ ] **Step 4: Syntax check the embedded JSX**

```bash
cp "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx" /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```
Expected: parse OK.

---

## Task 4: Wire `tools/bump_version.js`

**Files:**
- Modify: `tools/bump_version.js`

- [ ] **Step 1: Add to `JSX_TARGETS`**

Read `tools/bump_version.js` and locate `JSX_TARGETS`. Append:
```javascript
"vGallery/vGalleryRig.jsx"
```

- [ ] **Step 2: Verify with a dry bump**

```bash
node "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/tools/bump_version.js" patch --dry-run 2>&1 || true
```
If `--dry-run` isn't supported, just note the expected behavior and move on. The actual bump happens on real commits later.

---

## Task 5: `ensureFFX()` helper (decode + write FFX cache)

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper inside the IIFE, after constants**

```javascript
function ensureFFX() {
    var dir = new Folder(FFX_INSTALL_DIR);
    if (!dir.exists) { dir.create(); }
    var f = new File(dir.fsName + "/" + FFX_FILENAME);
    f.encoding = "BINARY";
    f.open("w");
    var bytes = unescape(FFX_HEX);
    f.write(bytes);
    f.close();
    return f;
}
```

(`unescape` decodes `\xHH` escape sequences into raw bytes, matching how `embed_ffx.js` encodes them.)

- [ ] **Step 2: Syntax check**

```bash
cp "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx" /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```

- [ ] **Step 3: Live test ensureFFX in AE**

Via atom-ae `run_extendscript`:
```javascript
$.evalFile(new File("/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx"));
// Wait — IIFE runs on evalFile and creates a window. We need to expose helpers.
```

**Fix:** the IIFE captures helpers privately. To make them testable individually, expose a debug handle when running via `evalFile`. Add at the top of the IIFE:
```javascript
$.global.__vGalleryRig = $.global.__vGalleryRig || {};
```
And at the bottom (inside the IIFE, before the UI builds):
```javascript
$.global.__vGalleryRig.ensureFFX = ensureFFX;
```

Re-run syntax check, then:
```javascript
$.evalFile(new File("/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx"));
var f = $.global.__vGalleryRig.ensureFFX();
$.writeln("FFX written to: " + f.fsName + " size=" + f.length);
```
Expected: file exists at `~/Library/Application Support/aeTools/vGallery/vGallery.ffx` with the same byte length as the source `vGallery/vGallery.ffx`.

Close any floating palettes from prior `evalFile` calls. Always close stale palettes before re-running `evalFile` (per `handoff/CLAUDE.md`).

---

## Task 6: `removeEffectByName(layer, name)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function removeEffectByName(layer, name) {
    var ep = layer.property("ADBE Effect Parade");
    if (!ep) { return false; }
    for (var i = ep.numProperties; i >= 1; i--) {
        var fx = ep.property(i);
        if (fx.name === name) {
            fx.remove();
            return true;
        }
    }
    return false;
}
```

Iterate **backwards** so removal during iteration is safe.

- [ ] **Step 2: Expose for testing**

Add to debug handle: `$.global.__vGalleryRig.removeEffectByName = removeEffectByName;`

- [ ] **Step 3: Syntax check**

(Same `node --check` pattern.)

- [ ] **Step 4: Live test**

Via atom-ae:
```javascript
$.evalFile(new File("/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools/vGallery/vGalleryRig.jsx"));
var rig = $.global.__vGalleryRig;
var comp = app.project.items.addComp("test-removeEffect", 800, 600, 1, 5, 30);
var s = comp.layers.addSolid([1,1,1], "test", 800, 600, 1);
var e1 = s.property("ADBE Effect Parade").addProperty("ADBE Tint"); e1.name = "vGallery Tint";
var e2 = s.property("ADBE Effect Parade").addProperty("ADBE Tint"); e2.name = "user tint";
$.writeln("before: " + s.property("ADBE Effect Parade").numProperties);
var r = rig.removeEffectByName(s, "vGallery Tint");
$.writeln("removed: " + r + " after: " + s.property("ADBE Effect Parade").numProperties);
$.writeln("survivor name: " + s.property("ADBE Effect Parade").property(1).name);
comp.remove();
```
Expected: before=2, removed=true, after=1, survivor name="user tint".

---

## Task 7: `selectOnly(layer)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function selectOnly(layer) {
    var comp = layer.containingComp;
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        if (L.selected && L !== layer) { L.selected = false; }
    }
    if (!layer.selected) { layer.selected = true; }
}

function captureSelection(comp) {
    var ids = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).selected) { ids.push(comp.layer(i).id); }
    }
    return ids;
}

function restoreSelection(comp, ids) {
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        var want = false;
        for (var j = 0; j < ids.length; j++) { if (ids[j] === L.id) { want = true; break; } }
        if (L.selected !== want) { L.selected = want; }
    }
}
```

- [ ] **Step 2: Expose** all three on debug handle.

- [ ] **Step 3: Syntax check** + live verify by selecting a few layers, capturing, modifying selection, restoring.

---

## Task 8: `findController(comp)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

Returns `{ layer: <LayerObject|null>, multiple: <bool>, foundByEffect: <bool> }`.

```javascript
function findController(comp) {
    var byEffect = [];
    var byName = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        // Only AVLayers can carry effects
        var ep = null;
        try { ep = L.property("ADBE Effect Parade"); } catch (e) { ep = null; }
        if (ep) {
            for (var k = 1; k <= ep.numProperties; k++) {
                if (ep.property(k).name === EFFECT_VGALLERY) {
                    byEffect.push(L);
                    break;
                }
            }
        }
        if (byName === null && L.name === CTRL_DEFAULT_NAME) {
            byName = L;
        }
    }
    if (byEffect.length > 0) {
        return { layer: byEffect[0], multiple: byEffect.length > 1, foundByEffect: true };
    }
    if (byName) {
        return { layer: byName, multiple: false, foundByEffect: false };
    }
    return { layer: null, multiple: false, foundByEffect: false };
}
```

- [ ] **Step 2: Expose, syntax check, live test**

Live test: create a comp with no controllers → expect `{layer: null}`. Add a layer named `vGALLERY CONTROLLER` → expect `foundByEffect: false`. Add a `vGallery` effect to that layer → expect `foundByEffect: true`.

---

## Task 9: `createController(comp)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function createController(comp) {
    var layer = comp.layers.addShape();
    layer.name = CTRL_DEFAULT_NAME;
    layer.threeDLayer = true;
    layer.transform.position.setValue([comp.width / 2, comp.height / 2, 0]);
    var rotX = layer.transform.property("ADBE Rotate X");
    if (rotX) { rotX.setValue(90); }
    return layer;
}
```

- [ ] **Step 2: Expose, syntax check, live test**

Live test: create a comp, call `createController(comp)`, verify:
- Layer name = `vGALLERY CONTROLLER`
- `threeDLayer === true`
- Position = `[comp.width/2, comp.height/2, 0]`
- X Rotation = 90

---

## Task 10: `ensureVGalleryEffect(controller)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function findEffectByName(layer, name) {
    var ep = layer.property("ADBE Effect Parade");
    if (!ep) { return null; }
    for (var i = 1; i <= ep.numProperties; i++) {
        if (ep.property(i).name === name) { return ep.property(i); }
    }
    return null;
}

function ensureVGalleryEffect(controller) {
    if (findEffectByName(controller, EFFECT_VGALLERY)) { return false; }
    var ffxFile = ensureFFX();
    var comp = controller.containingComp;
    var savedSel = captureSelection(comp);
    selectOnly(controller);
    controller.applyPreset(ffxFile);
    restoreSelection(comp, savedSel);
    return true;
}
```

- [ ] **Step 2: Expose, syntax check, live test**

Live test: comp + controller (no effects). Call `ensureVGalleryEffect(controller)`, expect `vGallery` effect appears with all expected sub-controls. Call again, expect no duplicate.

---

## Task 11: `ensureControllerDropShadow(controller)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function ensureControllerDropShadow(controller) {
    if (findEffectByName(controller, EFFECT_VG_DROP_SHADOW)) { return false; }
    var ds = controller.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
    ds.name = EFFECT_VG_DROP_SHADOW;
    ds = findEffectByName(controller, EFFECT_VG_DROP_SHADOW); // re-acquire after rename
    ds.property("ADBE Drop Shadow-0001").setValue([0, 0, 0, 1]);
    ds.property("ADBE Drop Shadow-0002").setValue(50);
    ds.property("ADBE Drop Shadow-0003").setValue(135);
    ds.property("ADBE Drop Shadow-0004").setValue(5);
    ds.property("ADBE Drop Shadow-0005").setValue(0);
    return true;
}
```

- [ ] **Step 2: Expose, syntax check, live test**

Verify the effect is added with the expected default values. Re-call: returns false, no duplicate.

---

## Task 12: `writeAutoComputedExpressions(controller)` helper

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add expression constants near other constants**

```javascript
var EXPR_IMAGE_COUNT =
    "var n = 0;\n" +
    "for (var i = 1; i <= thisComp.numLayers; i++) {\n" +
    "    var L = thisComp.layer(i);\n" +
    "    if (L.name.toLowerCase().indexOf(\"vg\") === 0 && L.enabled) { n++; }\n" +
    "}\n" +
    "n;";

var EXPR_TOTAL_LENGTH =
    "effect(\"vGallery\")(\"Image Count\") * effect(\"vGallery\")(\"Spacing\");";
```

- [ ] **Step 2: Add helper**

```javascript
function writeAutoComputedExpressions(controller) {
    var vg = findEffectByName(controller, EFFECT_VGALLERY);
    if (!vg) { return; }
    vg.property("Image Count").expression  = EXPR_IMAGE_COUNT;
    vg.property("Total Length").expression = EXPR_TOTAL_LENGTH;
}
```

- [ ] **Step 3: Expose, syntax check, live test**

Live test: comp with controller + `vGallery` effect + 3 layers named `vG_a`, `vG_b`, `bg.png`. Call helper. Sample `Image Count`: expect 2. Sample `Total Length`: expect 2 × current Spacing.

---

## Task 13: `buildExpressions(ctrlName)` factory

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

Returns an object with all per-image expression strings, with the controller layer name interpolated.

```javascript
function buildExpressions(ctrlName) {
    var ref = "thisComp.layer(\"" + ctrlName + "\")";
    return {
        travelLocation:
            "var ctrl = " + ref + ";\n" +
            "var spacing = ctrl.effect(\"vGallery\")(\"Spacing\");\n" +
            "var offset  = ctrl.effect(\"vGallery\")(\"Offset\");\n" +
            "var totalLen = ctrl.effect(\"vGallery\")(\"Total Length\");\n" +
            "var myIdx = -1, cnt = 0;\n" +
            "for (var i = 1; i <= thisComp.numLayers; i++) {\n" +
            "    var L = thisComp.layer(i);\n" +
            "    if (L.name.toLowerCase().indexOf(\"vg\") === 0 && L.enabled) {\n" +
            "        if (L.index === index) { myIdx = cnt; break; }\n" +
            "        cnt++;\n" +
            "    }\n" +
            "}\n" +
            "if (myIdx < 0 || totalLen <= 0) {\n" +
            "    value;\n" +
            "} else {\n" +
            "    (((offset - myIdx) * spacing) % totalLen + totalLen) % totalLen;\n" +
            "}",

        position:
            "var ctrl = " + ref + ";\n" +
            "var halfAng = degreesToRadians(ctrl.effect(\"vGallery\")(\"V Angle\") / 2);\n" +
            "var totalLen = ctrl.effect(\"vGallery\")(\"Total Length\");\n" +
            "var halfLen = totalLen / 2;\n" +
            "var p = effect(\"vGallery Travel Location\")(\"Slider\");\n" +
            "var d = p;\n" +
            "if (d > halfLen) { d = d - totalLen; }\n" +
            "var legSign = (d >= 0) ? 1 : -1;\n" +
            "var legDist = Math.abs(d);\n" +
            "var localX = legSign * legDist * Math.sin(halfAng);\n" +
            "var localY = legDist * Math.cos(halfAng);\n" +
            "ctrl.toWorld([localX, localY, 0]);",

        tintAmount:
            "var ctrl = " + ref + ";\n" +
            "var spacing = ctrl.effect(\"vGallery\")(\"Spacing\");\n" +
            "var visRange = ctrl.effect(\"vGallery\")(\"Visible Range\");\n" +
            "var totalLen = ctrl.effect(\"vGallery\")(\"Total Length\");\n" +
            "var p = effect(\"vGallery Travel Location\")(\"Slider\");\n" +
            "var distFromApex = Math.min(p, totalLen - p);\n" +
            "var visDist = visRange * spacing;\n" +
            "if (visDist <= 0) { 100; } else { linear(distFromApex, 0, visDist, 0, 100); }",

        fadeColor:
            ref + ".effect(\"vGallery\")(\"Fade Color\")",

        shadowColor:
            ref + ".effect(\"vGallery Drop Shadow\")(\"Shadow Color\")",
        shadowOpacity:
            ref + ".effect(\"vGallery Drop Shadow\")(\"Opacity\")",
        shadowDirection:
            ref + ".effect(\"vGallery Drop Shadow\")(\"Direction\")",
        shadowDistance:
            ref + ".effect(\"vGallery Drop Shadow\")(\"Distance\")",
        shadowSoftness:
            ref + ".effect(\"vGallery Drop Shadow\")(\"Softness\")"
    };
}
```

- [ ] **Step 2: Build-time expression syntax check**

For every string returned by `buildExpressions("ctrl")`, run `new Function(<expression>)` to catch parse errors. Add a tiny dev helper outside the IIFE (commented out — only enabled during plan execution):

Actually inside the IIFE we can have a debug self-check that runs only when `$.global.__vGalleryRig_DEV === true`:
```javascript
if ($.global.__vGalleryRig_DEV) {
    var test = buildExpressions("CTRL");
    for (var k in test) {
        try { new Function(test[k]); } catch (e) { $.writeln("EXPR PARSE FAIL: " + k + " — " + e.message); }
    }
}
```

- [ ] **Step 3: Expose, syntax check, run dev self-check**

Set `$.global.__vGalleryRig_DEV = true; $.evalFile(...);` and verify no `EXPR PARSE FAIL` lines printed.

---

## Task 14: `setRigOnLayer(layer, exprs)` (effect creation + expression wiring)

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function setRigOnLayer(layer, exprs) {
    // Hard reset: remove our three named effects if present
    removeEffectByName(layer, EFFECT_VG_TRAVEL_LOC);
    removeEffectByName(layer, EFFECT_VG_TINT);
    removeEffectByName(layer, EFFECT_VG_DROP_SHADOW);

    layer.threeDLayer = true;

    var ep = layer.property("ADBE Effect Parade");

    var slider = ep.addProperty("ADBE Slider Control");
    slider.name = EFFECT_VG_TRAVEL_LOC;

    var tint = ep.addProperty("ADBE Tint");
    tint.name = EFFECT_VG_TINT;

    var ds = ep.addProperty("ADBE Drop Shadow");
    ds.name = EFFECT_VG_DROP_SHADOW;

    // Re-acquire after each rename (addProperty + name set may invalidate)
    slider = findEffectByName(layer, EFFECT_VG_TRAVEL_LOC);
    tint   = findEffectByName(layer, EFFECT_VG_TINT);
    ds     = findEffectByName(layer, EFFECT_VG_DROP_SHADOW);

    slider.property("ADBE Slider Control-0001").expression = exprs.travelLocation;
    layer.transform.position.expression = exprs.position;

    tint.property("ADBE Tint-0001").expression = exprs.fadeColor; // Map Black To
    tint.property("ADBE Tint-0002").expression = exprs.fadeColor; // Map White To
    tint.property("ADBE Tint-0003").expression = exprs.tintAmount;

    ds.property("ADBE Drop Shadow-0001").expression = exprs.shadowColor;
    ds.property("ADBE Drop Shadow-0002").expression = exprs.shadowOpacity;
    ds.property("ADBE Drop Shadow-0003").expression = exprs.shadowDirection;
    ds.property("ADBE Drop Shadow-0004").expression = exprs.shadowDistance;
    ds.property("ADBE Drop Shadow-0005").expression = exprs.shadowSoftness;

    // Opacity: deliberately not touched
}
```

- [ ] **Step 2: Expose, syntax check, live test**

Live test: comp with controller + a solid layer named `vG_test`. Call helper. Verify all three effects exist on the layer with correct names; sample `effect("vGallery Travel Location")("Slider")` value (should be a number 0..totalLen); confirm Position expression is set; confirm Opacity has no expression.

---

## Task 15: `validateLayerForApply(layer)` (eligibility check)

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function validateLayerForApply(layer) {
    if (layer.locked) {
        return { ok: false, reason: "locked" };
    }
    if (layer instanceof CameraLayer || layer instanceof LightLayer) {
        return { ok: false, reason: "unsupported layer type" };
    }
    if (layer.adjustmentLayer === true) {
        return { ok: false, reason: "adjustment layer" };
    }
    if (layer.audioActive === true && layer.hasVideo === false) {
        return { ok: false, reason: "audio-only" };
    }
    return { ok: true };
}

function nameStartsWithVgPrefix(name) {
    return name.toLowerCase().indexOf(LAYER_PREFIX_LOWER) === 0;
}

function autoRenameIfNeeded(layer, results) {
    if (nameStartsWithVgPrefix(layer.name)) { return; }
    var oldName = layer.name;
    layer.name = LAYER_AUTORENAME_PREFIX + oldName;
    results.autoRenamed.push({ from: oldName, to: layer.name });
}
```

- [ ] **Step 2: Expose, syntax check, live test**

Build a comp with: a locked layer, a camera, an adjustment layer, a normal solid named `bg.png`, a normal solid named `vG_jane.png`. Run validation on each — expect locked/camera/adjustment to fail with correct reasons; `bg.png` and `vG_jane.png` to pass. Run autoRenameIfNeeded on `bg.png` → renamed to `vG_bg.png`; on `vG_jane.png` → unchanged.

---

## Task 16: `applyRig()` orchestration

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function applyRig() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Open a composition to apply the rig.");
        return;
    }

    var selected = comp.selectedLayers;
    var results = {
        rigged: [],
        skipped: [],
        autoRenamed: [],
        warnings: [],
        errors: []
    };

    app.beginUndoGroup("vGallery: Apply Rig");
    try {
        var lookup = findController(comp);
        var controller;
        var controllerWasCreated = false;
        if (!lookup.layer) {
            controller = createController(comp);
            controllerWasCreated = true;
        } else {
            controller = lookup.layer;
        }
        if (lookup.multiple) {
            results.warnings.push("Multiple controllers detected — using \"" + controller.name + "\".");
        }

        ensureVGalleryEffect(controller);
        ensureControllerDropShadow(controller);
        writeAutoComputedExpressions(controller);

        if (selected.length === 0) {
            app.endUndoGroup();
            if (controllerWasCreated) {
                alert(CTRL_DEFAULT_NAME + " created. Select layers and click Apply to rig them.");
            } else {
                alert("Select at least one layer and click Apply.");
            }
            return;
        }

        var exprs = buildExpressions(controller.name);

        for (var i = 0; i < selected.length; i++) {
            var L = selected[i];
            try {
                var v = validateLayerForApply(L);
                if (!v.ok) {
                    results.skipped.push({ name: L.name, reason: v.reason });
                    continue;
                }
                autoRenameIfNeeded(L, results);
                setRigOnLayer(L, exprs);
                results.rigged.push(L.name);
            } catch (perLayerErr) {
                results.skipped.push({ name: L.name, reason: "error: " + perLayerErr.message });
            }
        }
    } catch (outerErr) {
        results.errors.push(outerErr.message);
    } finally {
        try { app.endUndoGroup(); } catch (e) {}
    }

    showApplySummaryIfNeeded(results);
}
```

- [ ] **Step 2: Add `showApplySummaryIfNeeded(results)`**

```javascript
function showApplySummaryIfNeeded(r) {
    if (r.skipped.length === 0 && r.autoRenamed.length === 0 && r.warnings.length === 0 && r.errors.length === 0) {
        return;
    }
    var lines = [];
    lines.push(r.rigged.length + " rigged successfully.");
    if (r.autoRenamed.length > 0) {
        lines.push("");
        lines.push(r.autoRenamed.length + " auto-renamed:");
        for (var i = 0; i < r.autoRenamed.length; i++) {
            lines.push("  • " + r.autoRenamed[i].from + " → " + r.autoRenamed[i].to);
        }
    }
    if (r.skipped.length > 0) {
        lines.push("");
        lines.push(r.skipped.length + " skipped:");
        for (var j = 0; j < r.skipped.length; j++) {
            lines.push("  • " + r.skipped[j].name + " (" + r.skipped[j].reason + ")");
        }
    }
    if (r.warnings.length > 0) {
        lines.push("");
        lines.push("Warnings:");
        for (var k = 0; k < r.warnings.length; k++) {
            lines.push("  • " + r.warnings[k]);
        }
    }
    if (r.errors.length > 0) {
        lines.push("");
        lines.push("Errors:");
        for (var m = 0; m < r.errors.length; m++) {
            lines.push("  • " + r.errors[m]);
        }
    }
    alert(lines.join("\n"));
}
```

- [ ] **Step 3: Wire the button**

Replace the placeholder `btnApply.onClick`:
```javascript
btnApply.onClick = applyRig;
```

- [ ] **Step 4: Syntax check + live test**

Live test: open the test comp, select 0 layers in a fresh comp, click Apply → modal "vGALLERY CONTROLLER created…". Click Apply again with 0 layers → modal "Select at least one layer…". Add 2 solids named `vG_a`/`vG_b`, select both, click Apply → no modal (silent), both rigged.

---

## Task 17: `removeRig()` orchestration

**Files:**
- Modify: `vGallery/vGalleryRig.jsx`

- [ ] **Step 1: Add helper**

```javascript
function removeRig() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Open a composition to remove the rig.");
        return;
    }
    var selected = comp.selectedLayers;
    if (selected.length === 0) {
        alert("Select at least one layer and click Remove Rig.");
        return;
    }

    app.beginUndoGroup("vGallery: Remove Rig");
    try {
        for (var i = 0; i < selected.length; i++) {
            var L = selected[i];
            try {
                removeEffectByName(L, EFFECT_VG_TRAVEL_LOC);
                removeEffectByName(L, EFFECT_VG_TINT);
                removeEffectByName(L, EFFECT_VG_DROP_SHADOW);
                if (L.transform && L.transform.position) {
                    L.transform.position.expression = "";
                }
            } catch (perLayerErr) {
                // Silent — Remove Rig is best-effort and reports nothing on success
            }
        }
    } finally {
        try { app.endUndoGroup(); } catch (e) {}
    }
    // Silent on success.
}
```

- [ ] **Step 2: Wire the button**

```javascript
btnRemove.onClick = removeRig;
```

- [ ] **Step 3: Syntax check + live test**

Apply rig to 2 layers (Task 16), then click Remove on both → 3 effects gone, position expression cleared, layer name unchanged, 3D still on.

---

## Task 18: End-to-end test scenarios (from spec)

Run each scenario from the spec's test plan via atom-ae. Document results in a working scratchpad. All must pass before declaring the script ready.

- [ ] **Step 1: Fresh comp, no rig — Apply with no selection**

Create empty comp, evalFile, click Apply via UI (or call `applyRig()` directly via debug handle). Expect modal text: `vGALLERY CONTROLLER created. Select layers and click Apply to rig them.` Verify controller exists with `vGallery` + `vGallery Drop Shadow` effects.

- [ ] **Step 2: Fresh comp, one selected solid named `bg.png`**

Add solid named `bg.png`, select it, click Apply. Expect: layer renamed to `vG_bg.png`; modal lists 1 auto-rename. Rig effects added. 3D enabled. Position expression set. Opacity untouched.

- [ ] **Step 3: Re-apply on already-rigged layer**

Same layer from Step 2. Click Apply again. Expect: hard reset replaces the 3 effects (no duplicates). No auto-rename (already prefixed). No modal (silent — no skips, no auto-renames).

- [ ] **Step 4: Mixed selection (5 valid + 2 invalid + 1 needs rename)**

Build: 5 solids `vG_1`..`vG_5`; 1 camera; 1 adjustment layer; 1 solid `untitled.psd`. Select all 8. Click Apply. Expect modal:
- 6 rigged (5 vG_* + auto-renamed `vG_untitled.psd`)
- 1 auto-renamed
- 2 skipped (camera, adjustment)

- [ ] **Step 5: Locked layer**

Lock one of the vG_ layers, click Apply. Expect skip with "locked" reason.

- [ ] **Step 6: Remove on rigged layer**

Click Remove on a rigged layer. Verify: 3 effects gone, position expression cleared, name still `vG_*`, 3D still on. No modal.

- [ ] **Step 7: Remove on never-rigged layer**

Click Remove on a fresh solid that was never rigged. No-op, no error, no modal.

- [ ] **Step 8: Renamed controller**

Rename `vGALLERY CONTROLLER` to `Bob`. Click Apply on a layer. Expect: detection finds `Bob` by `vGallery` effect; per-image expressions reference `thisComp.layer("Bob")`. Sample one expression to confirm.

- [ ] **Step 9: Visual verification**

In a fresh comp with controller + 6 layers named `vG_1`..`vG_6` + a camera, add the rig. Scrub `Offset` on `vGallery`. Capture a few `preview_frames` and visually confirm V geometry.

- [ ] **Step 10: Cmd+Z after Apply**

After applying to a fresh comp, single Cmd+Z (or via `app.executeCommand(16)` to undo). Expect: all effects gone, layer name reverted, 3D toggled off, controller deleted (if we created it). One undo step covers everything.

If any of Steps 1–10 fails: stop, debug, fix in the appropriate prior task, re-run.

---

## Task 19: Update Phase 1 docs to final naming

**Files:**
- Modify: `vGallery/CLAUDE.md`
- Modify: `vGallery/README.md`
- Modify: `vGallery/EXPRESSIONS.md`

- [ ] **Step 1: `vGallery/CLAUDE.md`**

Find/replace (manual review of each occurrence, not blind sed):
- `GALLERY CONTROLLER` → `vGALLERY CONTROLLER`
- `V Gallery` → `vGallery`
- `Travel Location` (effect name only — not the property "Slider") → `vGallery Travel Location`
- `Tint` (where it refers to the rig's effect) → `vGallery Tint`
- `Drop Shadow` (rig's master + per-layer) → `vGallery Drop Shadow`
- `image_` prefix references → `vG_` (case-insensitive `vg`)
- Update Phase 2 section: change "in flight" → "complete (v1.0.0 shipped at vGallery/vGalleryRig.jsx)"

- [ ] **Step 2: `vGallery/README.md`**

Same find/replace. Update the "Adding new images (Phase 2 — coming)" section to describe the actual shipped script and panel.

- [ ] **Step 3: `vGallery/EXPRESSIONS.md`**

Same find/replace, plus update the verification table to reflect new sample values if you've changed any defaults during implementation. Update the create_rig call snippet to include the new `Image Count` and `Total Length` controls from Task 1.

- [ ] **Step 4: Add a "Provisional naming migration" callout**

In `vGallery/CLAUDE.md`, add a section:
```markdown
## Provisional naming history (pre-2026-04-25)

The original Phase 1 rig in `DreamOutdoor` used these provisional names,
which the v1.0.0 script no longer matches:

| Provisional | Final |
|---|---|
| GALLERY CONTROLLER | vGALLERY CONTROLLER |
| V Gallery | vGallery |
| Travel Location (effect) | vGallery Travel Location |
| Tint (effect) | vGallery Tint |
| Drop Shadow (effect) | vGallery Drop Shadow |
| image* prefix | vg* prefix (case-insensitive) |

To migrate the existing 36 imageRig-Gallery-* layers in DreamOutdoor:
either re-Apply the new script on them (auto-renames to vG_imageRig-…
and rewrites all expressions) or delete the legacy precomps in favor
of dragged image footage.
```

---

## Task 20: Final integration & build verification

**Files:**
- Modify: `vGallery/vGalleryRig.jsx` (header version)
- Verify: `tools/embed_ffx.js`, `tools/bump_version.js`

- [ ] **Step 1: Run the full build pipeline once**

```bash
cd "/Users/arturo/Library/CloudStorage/Dropbox/03 Projects/aeTools"
node tools/embed_ffx.js
cp vGallery/vGalleryRig.jsx /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```
Expected: embed completes with no errors; syntax check passes.

- [ ] **Step 2: Confirm version line is in JSX header**

Verify the `// Version: 1.0.0` line is present in the JSX header comment, exactly as `tools/bump_version.js`'s regex (`/Version:\s*\d+\.\d+\.\d+/`) expects.

- [ ] **Step 3: Confirm `tools/bump_version.js` accepts the new target**

```bash
node tools/bump_version.js patch
```
This bumps `1.0.0` → `1.0.1` repo-wide; verify the JSX header was updated alongside `VERSION` and the other JSXes.

If the bump worked end-to-end, immediately revert (the script ships at 1.0.0):
```bash
node tools/bump_version.js patch --revert  # or hand-edit back to 1.0.0
```
(If the tool doesn't support `--revert`, manually edit `VERSION` and the version line in each JSX back.)

- [ ] **Step 4: Final live smoke test**

In AE: install `vGalleryRig.jsx` in `Scripts/ScriptUI Panels/`, restart AE, open from Window menu. Verify panel appears, both buttons work end-to-end on a fresh comp. This validates that the shipped artifact (not just the dev path) works.

- [ ] **Step 5: User notification**

Tell the user the script is ready, where it lives, and the install instructions:

> v1.0.0 of `vGalleryRig.jsx` is ready at `vGallery/vGalleryRig.jsx`. To install: copy it into `~/Documents/Adobe/After Effects 2025/Scripts/ScriptUI Panels/` (or use your AE Scripts folder), restart AE, and open it from the Window menu.

Do not auto-commit; offer to commit when the user asks.

---

## Self-review

**Spec coverage:**
- ✅ Single-file JSX deliverable with embedded FFX (Tasks 1–3, 5)
- ✅ ScriptUI panel with two buttons + version line (Tasks 2, 16, 17)
- ✅ Modal alerts only on the listed conditions (Tasks 16, 17)
- ✅ Apply algorithm flow: validate → locate controller → ensure FFX/effects → bootstrap or per-layer apply (Tasks 5–16)
- ✅ Controller bootstrap as 3D shape, X rotation 90°, comp center (Task 9)
- ✅ Hard-reset semantics (delete by exact effect name) (Tasks 6, 14)
- ✅ Per-layer eligibility + auto-rename (Task 15)
- ✅ Per-layer fresh-add + expressions (Tasks 13, 14)
- ✅ Remove Rig as inverse, position expr cleared, 3D/name untouched (Task 17)
- ✅ Production safeguards: single undo group, atomic try/catch per layer, no locking (Tasks 16, 17)
- ✅ Build pipeline integration (Tasks 3, 4, 20)
- ✅ Phase 1 docs updated to new naming (Task 19)
- ✅ All 10 spec test scenarios (Task 18)

**Placeholder scan:** None. Each task has either explicit code, exact commands, or specific expected output.

**Type / name consistency:**
- Constants: `CTRL_DEFAULT_NAME`, `EFFECT_VGALLERY`, `EFFECT_VG_DROP_SHADOW`, `EFFECT_VG_TRAVEL_LOC`, `EFFECT_VG_TINT`, `LAYER_PREFIX_LOWER`, `LAYER_AUTORENAME_PREFIX`, `FFX_INSTALL_DIR`, `FFX_FILENAME` — all referenced by exact spelling across tasks.
- Helpers: `ensureFFX`, `removeEffectByName`, `findEffectByName`, `selectOnly`, `captureSelection`, `restoreSelection`, `findController`, `createController`, `ensureVGalleryEffect`, `ensureControllerDropShadow`, `writeAutoComputedExpressions`, `buildExpressions`, `setRigOnLayer`, `validateLayerForApply`, `nameStartsWithVgPrefix`, `autoRenameIfNeeded`, `applyRig`, `removeRig`, `showApplySummaryIfNeeded` — names consistent throughout.
- Effect matchPaths: ADBE Tint sub-properties use `ADBE Tint-0001` (Map Black To), `-0002` (Map White To), `-0003` (Amount to Tint). Drop Shadow: `-0001` Color, `-0002` Opacity, `-0003` Direction, `-0004` Distance, `-0005` Softness. Slider Control: `ADBE Slider Control-0001`. Consistent with Phase 1's verified usage.

**Known fuzziness flagged for execution:**
- `app.executeCommand(16)` for Cmd+Z (Task 18 step 10) is a guess — the engineer should confirm the actual command ID via `app.findMenuCommandId("Undo")` or just have the user press Cmd+Z manually.
- `tools/bump_version.js patch --revert` (Task 20 step 3) likely doesn't exist; the engineer should manually edit the version back to `1.0.0` if needed.
