#!/usr/bin/env node
// bump_version.js — increment the aeTools collection version by 0.1.
//
// Reads VERSION at the repo root, adds 0.1, writes it back, and mirrors
// the new value into SCRIPT_VERSION in handoff/Handoff.jsx so the script
// header and Window title stay in sync.
//
// Run before every commit:
//   node tools/bump_version.js
//   git add -A && git commit -m "..."
//
// Adds future scripts that need versioning to the JSX_TARGETS array
// below — each one gets its `var SCRIPT_VERSION = "X.Y";` line replaced
// in lockstep with VERSION.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'VERSION');

// Add new script .jsx files here as the collection grows.
const JSX_TARGETS = [
    path.join(ROOT, 'handoff', 'Handoff.jsx'),
];

function bumpDecimal(versionStr) {
    const num = parseFloat(versionStr);
    if (isNaN(num)) {
        throw new Error(`Invalid version in VERSION file: "${versionStr}"`);
    }
    return (num + 0.1).toFixed(1);
}

function main() {
    if (!fs.existsSync(VERSION_FILE)) {
        console.error('ERROR: VERSION file not found at ' + VERSION_FILE);
        process.exit(1);
    }
    const oldVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    const newVersion = bumpDecimal(oldVersion);

    fs.writeFileSync(VERSION_FILE, newVersion + '\n');
    console.log(`VERSION: ${oldVersion} -> ${newVersion}`);

    let updatedJsxCount = 0;
    for (const jsxPath of JSX_TARGETS) {
        if (!fs.existsSync(jsxPath)) {
            console.warn('  WARN: skipping missing target ' + jsxPath);
            continue;
        }
        const before = fs.readFileSync(jsxPath, 'utf8');
        const after = before.replace(
            /var SCRIPT_VERSION = "[^"]*";/,
            `var SCRIPT_VERSION = "${newVersion}";`
        );
        if (before === after) {
            console.warn('  WARN: no SCRIPT_VERSION constant found in ' + path.basename(jsxPath));
            continue;
        }
        fs.writeFileSync(jsxPath, after);
        console.log(`  ${path.relative(ROOT, jsxPath)}: SCRIPT_VERSION updated to ${newVersion}`);
        updatedJsxCount++;
    }

    if (updatedJsxCount === 0) {
        console.warn('No .jsx targets updated. Did you forget to declare SCRIPT_VERSION?');
    }
}

main();
