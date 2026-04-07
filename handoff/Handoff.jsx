/*
    Handoff — ScriptUI Panel
    Weighted, switchable, sticky dynamic parenting for After Effects.

    What it does
    ------------
    Dynamic parenting via velocity inheritance. Pick up to 5 parent layers
    and a per-parent weight (0..1). When a weight is non-zero, the rigged
    layer inherits that parent's *delta motion* in world space — frame to
    frame. When you ease a weight back to 0 the layer keeps the offset it
    accumulated and stops inheriting; it does NOT snap back to its rest
    position. This is the "stays where it was" property motion designers
    expect for hand-offs (e.g. apple from left hand to right hand).

    Position, rotation, and scale are all rigged. By default a single
    "Weight N" slider controls all three channels for parent N. Toggle
    "Use Individual Weights" to drive Position / Rotation / Scale weights
    separately per parent.

    How the math works
    ------------------
    For each frame t, the expression computes only the *incremental*
    contribution from t-dt to t and adds it to the accumulator stored in
    the property's previous-frame result:

        offset(t) = offset(t - dt) + Σ_parents  weight(t) · Δworld_transform

    The previous frame's accumulator is recovered via
        thisProperty.valueAtTime(t - dt) - thisProperty.valueAtTime(t - dt, true)
    where the second call returns the *pre-expression* value (the layer's
    own keyframed value at that time). This gives O(1) work per frame and
    O(frames) total render cost — versus the original O(frames²).

    Position is integrated as additive world-space vectors via toWorld().
    Rotation is integrated as additive degrees via the angle of a unit
    vector transformed through toWorld(). Scale is integrated as a
    multiplicative ratio via the length of basis vectors transformed
    through toWorld() — handled in log space inside the accumulator so
    that contributions from multiple parents combine cleanly.

    Compatible with both the Legacy and V8 expression engines (uses
    add/sub/mul vector helpers throughout — no array-operator booby
    traps).
*/

(function (thisObj) {

    var SCRIPT_NAME = "Handoff";

    // ---- Control naming ------------------------------------------------------
    //
    // Programmatic effect creation. No pseudo effect dependency. Each rigged
    // layer gets these 26 expression controls at the top level of its Effect
    // Controls panel:
    //
    //   Layer 1..5             — Layer Control, picks the parent layer
    //   Weight 1..5            — Slider, shared weight (0..1) for parent N
    //   Use Individual Weights — Checkbox
    //   Pos Weight 1..5        — Slider, position-only weight when checkbox on
    //   Rot Weight 1..5        — Slider, rotation-only weight when checkbox on
    //   Scale Weight 1..5      — Slider, scale-only weight when checkbox on

    var SLOTS           = 5;
    var NAME_LAYER      = "Layer ";
    var NAME_WEIGHT     = "Weight ";
    var NAME_USE_INDIV  = "Use Individual Weights";
    var NAME_POS_WEIGHT = "Pos Weight ";
    var NAME_ROT_WEIGHT = "Rot Weight ";
    var NAME_SCL_WEIGHT = "Scale Weight ";

    var MN_LAYER     = "ADBE Layer Control";
    var MN_SLIDER    = "ADBE Slider Control";
    var MN_CHECKBOX  = "ADBE Checkbox Control";

    // ---- Shared expression preamble ------------------------------------------
    //
    // Every property's expression starts with these helpers. Defining them as
    // a single block keeps the three expression bodies short and consistent.

    var EXPR_PREAMBLE = [
        'var dt = thisComp.frameDuration;',
        'var L = thisLayer;',
        'var useIndiv = L.effect("' + NAME_USE_INDIV + '")(1).value > 0.5;',
        '',
        '// Resolve weight for this channel (shared or individual)',
        'function W(p, indivName) {',
        '    var name = useIndiv ? (indivName + p) : ("' + NAME_WEIGHT + '" + p);',
        '    return L.effect(name)(1).value;',
        '}',
        ''
    ].join('\n');

    // ---- Position expression -------------------------------------------------
    //
    // Recursive delta in world space. Δp_parent = parent.toWorld(anchor, t)
    // - parent.toWorld(anchor, t-dt). Per-frame cost: 5 parents × 2 toWorld
    // calls + 2 valueAtTime recursions = ~12 calls. Render cost: O(frames).

    var EXPR_POSITION = EXPR_PREAMBLE + [
        'function frameDelta(t) {',
        '    var d = [0, 0];',
        '    for (var p = 1; p <= ' + SLOTS + '; p++) {',
        '        try {',
        '            var w = W(p, "' + NAME_POS_WEIGHT + '");',
        '            if (w !== 0) {',
        '                var lyr = L.effect("' + NAME_LAYER + '" + p)(1);',
        '                var a   = lyr.transform.anchorPoint.value;',
        '                var dp  = sub(lyr.toWorld(a, t), lyr.toWorld(a, t - dt));',
        '                d = add(d, mul(dp, w));',
        '            }',
        '        } catch (e) {}',
        '    }',
        '    return d;',
        '}',
        '',
        'if (time - dt < 0) {',
        '    value;',
        '} else {',
        '    var prevPost = thisProperty.valueAtTime(time - dt);',
        '    var prevPre  = thisProperty.valueAtTime(time - dt, true);',
        '    var prevOff  = sub(prevPost, prevPre);',
        '    add(value, add(prevOff, frameDelta(time)));',
        '}'
    ].join('\n');

    // ---- Rotation expression -------------------------------------------------
    //
    // Rotation in world space, derived from the angle of the parent's local
    // X-axis (a unit vector at [100, 0]) after toWorld transformation. This
    // walks the parent's own parent chain correctly. Wraparound (359° → 1°)
    // is corrected by clamping the per-frame delta to ±180°.

    var EXPR_ROTATION = EXPR_PREAMBLE + [
        'function worldRot(lyr, t) {',
        '    var p0 = lyr.toWorld([0, 0], t);',
        '    var p1 = lyr.toWorld([100, 0], t);',
        '    return radiansToDegrees(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));',
        '}',
        '',
        'function unwrap(d) {',
        '    while (d > 180)  d -= 360;',
        '    while (d < -180) d += 360;',
        '    return d;',
        '}',
        '',
        'function frameDelta(t) {',
        '    var d = 0;',
        '    for (var p = 1; p <= ' + SLOTS + '; p++) {',
        '        try {',
        '            var w = W(p, "' + NAME_ROT_WEIGHT + '");',
        '            if (w !== 0) {',
        '                var lyr = L.effect("' + NAME_LAYER + '" + p)(1);',
        '                var dr  = unwrap(worldRot(lyr, t) - worldRot(lyr, t - dt));',
        '                d += w * dr;',
        '            }',
        '        } catch (e) {}',
        '    }',
        '    return d;',
        '}',
        '',
        'if (time - dt < 0) {',
        '    value;',
        '} else {',
        '    var prevPost = thisProperty.valueAtTime(time - dt);',
        '    var prevPre  = thisProperty.valueAtTime(time - dt, true);',
        '    value + (prevPost - prevPre) + frameDelta(time);',
        '}'
    ].join('\n');

    // ---- Scale expression ----------------------------------------------------
    //
    // Scale in world space, derived from the length of the parent's local
    // basis vectors after toWorld. Scale combines multiplicatively, so the
    // accumulator stores the integrated log-ratio per axis. Output is
    //     value × exp(log_ratio)
    // which is mathematically equivalent to multiplying by the cumulative
    // ratio. Reading the previous frame's log-ratio back from prevPost/prevPre
    // requires log(prevPost / prevPre), with a small epsilon clamp to avoid
    // log(0). AE scale property is in percent (e.g., [100, 100] for 100%).

    var EXPR_SCALE = EXPR_PREAMBLE + [
        'var EPS = 1e-6;',
        '',
        'function worldScale(lyr, t) {',
        '    var p0 = lyr.toWorld([0, 0], t);',
        '    var px = lyr.toWorld([100, 0], t);',
        '    var py = lyr.toWorld([0, 100], t);',
        '    var sx = length(sub(px, p0)) / 100;',
        '    var sy = length(sub(py, p0)) / 100;',
        '    return [Math.max(sx, EPS), Math.max(sy, EPS)];',
        '}',
        '',
        'function frameDelta(t) {',
        '    var dlog = [0, 0];',
        '    for (var p = 1; p <= ' + SLOTS + '; p++) {',
        '        try {',
        '            var w = W(p, "' + NAME_SCL_WEIGHT + '");',
        '            if (w !== 0) {',
        '                var lyr  = L.effect("' + NAME_LAYER + '" + p)(1);',
        '                var sNow = worldScale(lyr, t);',
        '                var sPre = worldScale(lyr, t - dt);',
        '                var lx = Math.log(sNow[0]) - Math.log(sPre[0]);',
        '                var ly = Math.log(sNow[1]) - Math.log(sPre[1]);',
        '                dlog = add(dlog, mul([lx, ly], w));',
        '            }',
        '        } catch (e) {}',
        '    }',
        '    return dlog;',
        '}',
        '',
        'if (time - dt < 0) {',
        '    value;',
        '} else {',
        '    var prevPost = thisProperty.valueAtTime(time - dt);',
        '    var prevPre  = thisProperty.valueAtTime(time - dt, true);',
        '    var prevLogX = Math.log(Math.max(prevPost[0], EPS)) - Math.log(Math.max(prevPre[0], EPS));',
        '    var prevLogY = Math.log(Math.max(prevPost[1], EPS)) - Math.log(Math.max(prevPre[1], EPS));',
        '    var d = frameDelta(time);',
        '    [',
        '        value[0] * Math.exp(prevLogX + d[0]),',
        '        value[1] * Math.exp(prevLogY + d[1])',
        '    ];',
        '}'
    ].join('\n');

    // ---- Rig apply / remove --------------------------------------------------

    function findEffect(layer, name) {
        var fxPar = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= fxPar.numProperties; i++) {
            if (fxPar.property(i).name === name) return fxPar.property(i);
        }
        return null;
    }

    function ensureControl(layer, name, matchName, defaultValue) {
        var existing = findEffect(layer, name);
        if (existing) return existing;
        var fxPar = layer.property("ADBE Effect Parade");
        var ctrl  = fxPar.addProperty(matchName);
        ctrl.name = name;
        if (defaultValue !== undefined && matchName === MN_SLIDER) {
            try { ctrl.property(1).setValue(defaultValue); } catch (e) {}
        }
        return ctrl;
    }

    function applyRig(layer) {
        // Layer pickers + shared weights
        for (var p = 1; p <= SLOTS; p++) {
            ensureControl(layer, NAME_LAYER  + p, MN_LAYER);
            ensureControl(layer, NAME_WEIGHT + p, MN_SLIDER, 0);
        }
        // Mode toggle
        ensureControl(layer, NAME_USE_INDIV, MN_CHECKBOX);
        // Per-channel weights (only used when toggle is on)
        for (var q = 1; q <= SLOTS; q++) {
            ensureControl(layer, NAME_POS_WEIGHT + q, MN_SLIDER, 0);
            ensureControl(layer, NAME_ROT_WEIGHT + q, MN_SLIDER, 0);
            ensureControl(layer, NAME_SCL_WEIGHT + q, MN_SLIDER, 0);
        }

        // Attach the three expressions
        var tg  = layer.property("ADBE Transform Group");
        tg.property("ADBE Position").expression  = EXPR_POSITION;
        tg.property("ADBE Rotate Z").expression  = EXPR_ROTATION;
        tg.property("ADBE Scale").expression     = EXPR_SCALE;
    }

    function removeRig(layer) {
        // Clear expressions first
        var tg = layer.property("ADBE Transform Group");
        var props = ["ADBE Position", "ADBE Rotate Z", "ADBE Scale"];
        for (var i = 0; i < props.length; i++) {
            var pr = tg.property(props[i]);
            if (pr.expressionEnabled) pr.expression = "";
        }

        // Remove all controls we created (matched by name)
        var names = [];
        for (var p = 1; p <= SLOTS; p++) {
            names.push(NAME_LAYER  + p);
            names.push(NAME_WEIGHT + p);
        }
        names.push(NAME_USE_INDIV);
        for (var q = 1; q <= SLOTS; q++) {
            names.push(NAME_POS_WEIGHT + q);
            names.push(NAME_ROT_WEIGHT + q);
            names.push(NAME_SCL_WEIGHT + q);
        }

        var fxPar = layer.property("ADBE Effect Parade");
        for (var n = fxPar.numProperties; n >= 1; n--) {
            var fxName = fxPar.property(n).name;
            for (var k = 0; k < names.length; k++) {
                if (fxName === names[k]) {
                    fxPar.property(n).remove();
                    break;
                }
            }
        }
    }

    // ---- UI ------------------------------------------------------------------

    function buildUI(thisObj) {
        var panel = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        panel.orientation = "column";
        panel.alignChildren = ["fill", "top"];
        panel.spacing = 0;
        panel.margins = 6;

        var row = panel.add("group");
        row.orientation = "row";
        row.alignChildren = ["fill", "fill"];
        row.spacing = 4;
        row.margins = 0;

        var mainBtn = row.add("button", undefined, "Handoff");
        mainBtn.alignment = ["fill", "fill"];
        mainBtn.preferredSize = [-1, 32];
        mainBtn.helpTip = "Apply dynamic parenting to selected layers";

        var xBtn = row.add("button", undefined, "\u2715");
        xBtn.preferredSize = [32, 32];
        xBtn.maximumSize = [32, 32];
        xBtn.alignment = ["right", "fill"];
        xBtn.helpTip = "Remove dynamic parenting from selected layers";

        mainBtn.onClick = function () {
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) {
                alert("Open a composition first.", SCRIPT_NAME);
                return;
            }
            var sel = comp.selectedLayers;
            if (sel.length === 0) {
                alert("Select at least one layer.", SCRIPT_NAME);
                return;
            }
            app.beginUndoGroup("Apply " + SCRIPT_NAME);
            for (var i = 0; i < sel.length; i++) {
                try {
                    applyRig(sel[i]);
                } catch (e) {
                    alert(
                        "Could not apply to \"" + sel[i].name + "\".\n\n"
                        + "Error: " + e.message,
                        SCRIPT_NAME
                    );
                    break;
                }
            }
            app.endUndoGroup();
        };

        xBtn.onClick = function () {
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) return;
            var sel = comp.selectedLayers;
            if (sel.length === 0) {
                alert("Select layer(s) to remove rig from.", SCRIPT_NAME);
                return;
            }
            app.beginUndoGroup("Remove " + SCRIPT_NAME);
            for (var i = 0; i < sel.length; i++) {
                removeRig(sel[i]);
            }
            app.endUndoGroup();
        };

        panel.layout.layout(true);
        if (!(panel instanceof Panel)) {
            panel.center();
            panel.show();
        }
        return panel;
    }

    buildUI(thisObj);

})(this);
