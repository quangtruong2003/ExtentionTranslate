import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sectionSource, selectorSource] = await Promise.all([
  readFile(new URL("../src/settings/sections/OpenRouterSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ModelSelector.tsx", import.meta.url), "utf8"),
]);

assert.match(sectionSource, /handleCheckKey/, "API keys can be verified inline");
assert.match(sectionSource, /checkKey/);
assert.match(sectionSource, /keyCheckOk/, "success reports the model count");
assert.match(sectionSource, /systemPromptHint/, "the prompt description explains both roles");
assert.doesNotMatch(selectorSource, /debounceRef/, "the redundant debounce timer is gone");
assert.match(selectorSource, /selectedModel/, "the trigger shows the friendly model name");

console.log("PASS: OpenRouter settings verify keys and show friendly model names.");
