import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");

// The debounced selection handler must not block on a settings round-trip.
const selectionHandler = contentSource.slice(
  contentSource.indexOf("function onSelectionEvent"),
  contentSource.indexOf("async function refreshSettings"),
);
assert.ok(selectionHandler.length > 0, "located onSelectionEvent body");
assert.doesNotMatch(selectionHandler, /await\s+refreshSettings\(\)/, "selection hot path must not await refreshSettings()");

// Settings freshness still comes from the storage watcher + init refresh.
assert.match(contentSource, /chrome\.storage\.onChanged\.addListener/, "storage.onChanged watcher remains");
const initBody = contentSource.slice(contentSource.indexOf("(function init()"));
assert.match(initBody, /refreshSettings\(\)/, "init still primes the settings cache");
