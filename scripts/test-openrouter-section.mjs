import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sectionSource, selectorSource] = await Promise.all([
  readFile(new URL("../src/settings/sections/OpenRouterSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ModelSelector.tsx", import.meta.url), "utf8"),
]);

assert.match(sectionSource, /handleCheckKey/, "API keys can be verified inline");
assert.match(sectionSource, /Kiểm tra key/);
assert.match(sectionSource, /Key hợp lệ/, "success reports the model count");
assert.match(sectionSource, /điều khiển ngôn ngữ và cách trả lời của tab AI/, "the prompt description explains both roles");
assert.doesNotMatch(selectorSource, /debounceRef/, "the redundant debounce timer is gone");
assert.match(selectorSource, /selectedModel/, "the trigger shows the friendly model name");

console.log("PASS: OpenRouter settings verify keys and show friendly model names.");
