#!/usr/bin/env node
/**
 * check-sync.mjs — verifies that the KEEP-IN-SYNC-marked function copies are
 * identical (modulo whitespace) across the three actor main.js files.
 *
 * Each actor must stay a self-contained directory for `apify push`, so shared
 * logic is deliberately duplicated. Every shared block is fenced with:
 *
 *   // KEEP-IN-SYNC: ...   (start of block)
 *   // END-KEEP-IN-SYNC    (end of block)
 *
 * This script extracts every top-level function declared inside those fences,
 * groups the copies by function name, and exits non-zero if any two copies of
 * the same function differ after whitespace normalization. Not every file has
 * to carry every shared function (robots parsing lives in only two actors),
 * but every copy that exists must match.
 *
 * Run before `apify push`:  node apify/check-sync.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = [
    'agent-readiness-auditor/main.js',
    'llms-txt-extractor/main.js',
    'mcp-server-health-checker/main.js',
];
const START_MARK = 'KEEP-IN-SYNC:';
const END_MARK = 'END-KEEP-IN-SYNC';

// Collapse all whitespace runs so formatting-only differences don't fail the check.
function normalize(code) {
    return code.replace(/\s+/g, ' ').trim();
}

// Extracts the text between KEEP-IN-SYNC / END-KEEP-IN-SYNC fences.
function extractRegions(source, file) {
    const regions = [];
    const lines = source.split('\n');
    let current = null;
    for (const line of lines) {
        if (line.includes(END_MARK)) {
            if (current === null) fail(`${file}: END-KEEP-IN-SYNC without a matching KEEP-IN-SYNC start.`);
            regions.push(current.join('\n'));
            current = null;
            continue;
        }
        if (line.includes(START_MARK)) {
            if (current !== null) fail(`${file}: nested KEEP-IN-SYNC start marker.`);
            current = [];
            continue;
        }
        if (current !== null) current.push(line);
    }
    if (current !== null) fail(`${file}: KEEP-IN-SYNC block never closed with END-KEEP-IN-SYNC.`);
    return regions;
}

// Extracts top-level `function name(...) { ... }` declarations via brace matching.
function extractFunctions(text) {
    const fns = [];
    const re = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
        let i = text.indexOf('{', re.lastIndex);
        if (i < 0) break;
        let depth = 0;
        for (; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') {
                depth--;
                if (depth === 0) { i++; break; }
            }
        }
        fns.push({ name: m[1], body: text.slice(m.index, i) });
        re.lastIndex = i;
    }
    return fns;
}

function fail(message) {
    console.error(`check-sync: ${message}`);
    process.exitCode = 1;
}

const copies = new Map(); // name -> [{file, body, normalized}]
for (const rel of FILES) {
    const path = join(here, rel);
    let source;
    try {
        source = readFileSync(path, 'utf8');
    } catch (err) {
        fail(`cannot read ${rel}: ${err.message}`);
        continue;
    }
    for (const region of extractRegions(source, rel)) {
        for (const fn of extractFunctions(region)) {
            if (!copies.has(fn.name)) copies.set(fn.name, []);
            const list = copies.get(fn.name);
            if (list.some((c) => c.file === rel)) fail(`${rel}: duplicate KEEP-IN-SYNC function "${fn.name}".`);
            list.push({ file: rel, body: fn.body, normalized: normalize(fn.body) });
        }
    }
}

if (copies.size === 0) fail('no KEEP-IN-SYNC-marked functions found in any file.');

let checked = 0;
for (const [name, list] of copies) {
    if (list.length < 2) {
        console.warn(`check-sync: warning — "${name}" is marked KEEP-IN-SYNC but exists in only ${list[0].file}.`);
        continue;
    }
    checked += 1;
    const reference = list[0];
    for (const copy of list.slice(1)) {
        if (copy.normalized !== reference.normalized) {
            fail(`function "${name}" differs between ${reference.file} and ${copy.file}.`);
        }
    }
}

if (process.exitCode) {
    console.error('check-sync: FAILED — make the KEEP-IN-SYNC copies identical before `apify push`.');
} else {
    console.log(`check-sync: OK — ${checked} shared function(s) in sync across ${FILES.length} files.`);
}
