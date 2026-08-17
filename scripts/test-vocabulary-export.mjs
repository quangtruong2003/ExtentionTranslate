import assert from "node:assert/strict";
import { toVocabularyCsv, toAnkiCsv } from "../src/shared/exporters.ts";

const records = [
  { word: "run", translation: "chạy, vận hành", lookedUpAt: 1755400000000, favorite: true },
  { word: 'say "hi", ok', translation: 'nói "xin chào"', lookedUpAt: 1755400001000, favorite: false },
];

const csv = toVocabularyCsv(records);
const lines = csv.split("\n");
assert.equal(lines[0], "word,translation,favorite,lookedUpAt");
assert.equal(lines[1], "run,\"chạy, vận hành\",true,1755400000000");
assert.equal(lines[2], "\"say \"\"hi\"\", ok\",\"nói \"\"xin chào\"\"\",false,1755400001000");

const anki = toAnkiCsv(records);
const ankiLines = anki.split("\n");
assert.equal(ankiLines[0], "#separator:Comma");
assert.equal(ankiLines[1], "#html:false");
assert.equal(ankiLines[2], "run,chạy\\, vận hành");
assert.ok(ankiLines[3].startsWith('"say ""hi""'), "quotes are doubled in Anki export");

console.log("test-vocabulary-export: PASS");
