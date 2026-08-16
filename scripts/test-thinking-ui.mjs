import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldAutoCollapseThinking, shouldShowThinking } from "../src/components/dictionary/thinkingState.ts";

assert.equal(shouldShowThinking(true, "Check context."), true);
assert.equal(shouldShowThinking(false, "Check context."), false);
assert.equal(shouldShowThinking(true, "   "), false);

assert.equal(shouldAutoCollapseThinking("", "First answer chunk", true), true);
assert.equal(shouldAutoCollapseThinking("First", "First answer", true), false);
assert.equal(shouldAutoCollapseThinking("Previous answer", "", true), true);
assert.equal(shouldAutoCollapseThinking("First answer", "First answer", false), true);

const aiSectionSource = await readFile(new URL("../src/components/dictionary/AISection.tsx", import.meta.url), "utf8");
assert.match(aiSectionSource, /interface Props \{[\s\S]*?requested:\s*boolean;/);
assert.doesNotMatch(aiSectionSource, /AIRequestedContext|AIRequestStateProvider/);
assert.match(aiSectionSource, /!requested\s*&&\s*!loading\s*&&\s*!error\s*&&\s*!streamText/);
assert.match(aiSectionSource, /\{streamText\s*&&\s*\(/);
assert.match(aiSectionSource, /\{error\s*&&\s*\(/);

const dictionaryPopupSource = await readFile(new URL("../src/components/dictionary/DictionaryPopup.tsx", import.meta.url), "utf8");
assert.match(dictionaryPopupSource, /interface Props \{[\s\S]*?aiRequested:\s*boolean;/);
assert.match(dictionaryPopupSource, /<AISection[\s\S]*?requested=\{aiRequested\}/);

const contentSource = await readFile(new URL("../src/content/index.tsx", import.meta.url), "utf8");
assert.match(contentSource, /aiRequested:\s*boolean/);
assert.match(contentSource, /aiRequested:\s*false/);
assert.match(contentSource, /aiRequested:\s*true/);
assert.match(contentSource, /<DictionaryPopup[\s\S]*?aiRequested=\{state\.aiRequested\}/);
assert.doesNotMatch(contentSource, /AIRequestStateProvider/);

console.log("PASS: thinking disclosure visibility and auto-collapse rules are stable.");
