# aeTools — Claude Code instructions

A collection of After Effects scripts, pseudo-effect rigs, and dev tools.

## Layout

```
aeTools/
  CLAUDE.md           — this file (collection-level)
  README.md           — collection index for humans
  <script>/           — one folder per script, each with its own CLAUDE.md
    CLAUDE.md         — script-specific notes (live in the script folder)
    <Script>.jsx      — single-file deliverable
    <Script>.ffx      — pseudo-effect source-of-truth (if applicable)
    README.md
  tools/              — dev helpers shared across scripts
    embed_ffx.js      — re-embed a script's .ffx into its .jsx after PEM edits
    build_pseudo_test.js — generate atom-ae test rigs with embedded binaries
  resources/          — gitignored: Adobe docs, scripting guides, reference material
```

Each script folder has its own `CLAUDE.md` with the script-specific
learnings (AE expression-engine traps, test fixture details, code style for
that script's runtime, etc). When working in a script subfolder, both this
root `CLAUDE.md` AND the script's `CLAUDE.md` are loaded.

## Conventions across the collection

- **Single-file delivery.** End users should only need to drop the `.jsx`
  into their `Scripts/ScriptUI Panels/` folder. If a script needs a binary
  pseudo-effect, embed it via the rendertom-style hex-escape pattern (see
  `tools/embed_ffx.js` and `handoff/CLAUDE.md`) — no `.ffx` sidecars, no
  `PresetEffects.xml` editing, no install dance.
- **Source-of-truth binaries live in the script folder** (e.g.,
  `handoff/Handoff.ffx`) so they can be edited in Pseudo Effect Maker and
  inspected in git. After editing, rerun `node tools/embed_ffx.js` to
  refresh the embedded blob in the corresponding `.jsx`.
- **Per-script READMEs** for end users. **Per-script CLAUDE.md files** for
  AI-assistant context.
- **Never auto-commit.** Only commit when explicitly asked.

## Versioning (semver, in the file's comment header)

The version lives in **two places**, kept in lockstep:

1. **`VERSION`** at the repo root — single line, e.g. `1.0.2`
2. **The `Version: X.Y.Z` line** in each script's header comment block —
   second line, just under the script name

The `.jsx` **filename stays clean** (`Handoff.jsx`, not
`Handoff v1.0.2.jsx`) so AE's docked panel header reads "Handoff" with
no version clutter. The script's UI also stays clean — no version on
the button, no version in the Window title. The version is visible
only to people who open the source file (where it sits at the top of
the comment block) and to anyone reading `VERSION` in the repo.

**Bump the version on every commit**, choosing the right segment:

| Bump | When | Example |
|---|---|---|
| `patch` (default) | Small fixes: typos, doc tweaks, refactors with no behavior change | `1.0.5 → 1.0.6` |
| `minor` | New features, schema additions, anything backwards-compatible | `1.0.5 → 1.1.0` |
| `major` | Breaking changes: removed parameters, renamed pseudo-effect matchnames without legacy cleanup, anything that breaks existing rigs in user projects | `1.5.3 → 2.0.0` |

Workflow:

```bash
node tools/bump_version.js          # patch (default)
node tools/bump_version.js minor    # bump minor, reset patch
node tools/bump_version.js major    # bump major, reset minor + patch
git add -A
git commit -m "..."
git push
```

`tools/bump_version.js` parses the current version, increments the
requested segment (resetting lower segments per semver), writes the
new value to `VERSION`, and rewrites the `Version: X.Y.Z` line inside
every `.jsx` registered in the `JSX_TARGETS` array inside the bump
tool. Add new scripts to that array as the collection grows. Each
script must have a `Version: X.Y.Z` line somewhere in its header
comment block — the bump tool matches with a regex (`/Version:\s*\d+\.\d+\.\d+/`)
so the surrounding indent and formatting is preserved.
