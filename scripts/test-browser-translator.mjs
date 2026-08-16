import assert from "node:assert/strict";
import {
  BrowserDictionaryTranslator,
  toBrowserTargetLanguage,
  translateDictionaryEntryWithSession,
} from "../src/services/dictionary/browserTranslator.ts";

const sourceEntry = {
  word: "run",
  language: "en",
  phonetics: {
    uk: "/rʌn/",
    us: "/rʌn/",
    audioUk: "https://api.dictionaryapi.dev/media/pronunciations/en/run-uk.mp3",
    audioUs: "https://api.dictionaryapi.dev/media/pronunciations/en/run-us.mp3",
  },
  wordForms: ["runs", "running", "ran"],
  meanings: [
    {
      partOfSpeech: "verb",
      translation: "to move quickly on foot",
      definition: "to move quickly on foot",
      examples: ["They run every morning."],
      phrases: [
        {
          phrase: "run fast",
          translation: "move quickly",
          meaning: "move with speed",
        },
      ],
      synonyms: ["jog"],
    },
    {
      partOfSpeech: "noun",
      definition: "an act or spell of running",
      examples: ["He went for a short run."],
      synonyms: ["jog"],
    },
  ],
  source: "free-api",
};

assert.equal(toBrowserTargetLanguage("vi"), "vi");
assert.equal(toBrowserTargetLanguage("zh-CN"), "zh");

const translateCalls = [];
const fakeSession = {
  async translate(input) {
    translateCalls.push(input);
    return `VI:${input}`;
  },
  destroyCalls: 0,
  destroy() {
    this.destroyCalls += 1;
  },
};

const translated = await translateDictionaryEntryWithSession(
  sourceEntry,
  "vi",
  fakeSession,
  new AbortController().signal,
);

assert.equal(translated.language, "vi");
assert.equal(translated.meanings[0].partOfSpeech, "VI:verb");
assert.equal(translated.meanings[0].translation, "VI:to move quickly on foot");
assert.equal(translated.meanings[0].definition, "VI:to move quickly on foot");
assert.deepEqual(translated.meanings[0].examples, ["VI:They run every morning."]);
assert.deepEqual(translated.meanings[0].phrases, [
  {
    phrase: "VI:run fast",
    translation: "VI:move quickly",
    meaning: "VI:move with speed",
  },
]);
assert.deepEqual(translated.meanings[0].synonyms, ["VI:jog"]);
assert.deepEqual(translated.phonetics, sourceEntry.phonetics);
assert.equal(translated.word, "run");
assert.deepEqual(translated.wordForms, sourceEntry.wordForms);
assert.deepEqual(translateCalls, [
  "verb",
  "to move quickly on foot",
  "to move quickly on foot",
  "They run every morning.",
  "run fast",
  "move quickly",
  "move with speed",
  "jog",
  "noun",
  "an act or spell of running",
  "He went for a short run.",
  "jog",
]);

let createCalls = 0;
let availabilityCalls = 0;
const factory = {
  async availability(options) {
    availabilityCalls += 1;
    assert.deepEqual(options, { sourceLanguage: "en", targetLanguage: "vi" });
    return "available";
  },
  async create(options) {
    createCalls += 1;
    assert.deepEqual(options, { sourceLanguage: "en", targetLanguage: "vi" });
    const session = {
      translate: async (input) => `VI:${input}`,
      destroyCalls: 0,
      destroy() {
        this.destroyCalls += 1;
      },
    };
    return session;
  },
};

const translator = new BrowserDictionaryTranslator(() => factory);
await Promise.all([translator.warm("vi"), translator.warm("vi")]);
assert.equal(availabilityCalls, 1);
assert.equal(createCalls, 1);

const rawCalls = [];
const rawSessions = [];
const rawTranslator = new BrowserDictionaryTranslator(() => ({
  async availability(options) {
    rawCalls.push(["availability", options]);
    return "available";
  },
  async create(options) {
    rawCalls.push(["create", options]);
    const session = {
      async translate(input) {
        return `${options.sourceLanguage}->${options.targetLanguage}:${input}`;
      },
      destroyCalls: 0,
      destroy() {
        this.destroyCalls += 1;
      },
    };
    rawSessions.push(session);
    return session;
  },
}));

assert.equal(await rawTranslator.translateText("  xin chào  ", "vi", "en"), "vi->en:xin chào");
assert.equal(await rawTranslator.translateText(" hello ", "en", "vi"), "en->vi:hello");
assert.equal(rawSessions.length, 2);
assert.deepEqual(rawCalls, [
  ["availability", { sourceLanguage: "vi", targetLanguage: "en" }],
  ["create", { sourceLanguage: "vi", targetLanguage: "en" }],
  ["availability", { sourceLanguage: "en", targetLanguage: "vi" }],
  ["create", { sourceLanguage: "en", targetLanguage: "vi" }],
]);

let delayedResolve;
let concurrentCreateCalls = 0;
const concurrentTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "available";
  },
  async create() {
    concurrentCreateCalls += 1;
    await new Promise((resolve) => {
      delayedResolve = resolve;
    });
    return {
      async translate(input) {
        return `VI:${input}`;
      },
      destroy() {},
    };
  },
}));

const firstConcurrentTranslation = concurrentTranslator.translateText("one", "en", "vi");
const secondConcurrentTranslation = concurrentTranslator.translateText("two", "en", "vi");
await Promise.resolve();
assert.equal(concurrentCreateCalls, 1);
delayedResolve();
assert.deepEqual(await Promise.all([firstConcurrentTranslation, secondConcurrentTranslation]), ["VI:one", "VI:two"]);

let emptyCreateCalls = 0;
const emptySessions = [];
const emptyTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "available";
  },
  async create() {
    emptyCreateCalls += 1;
    const session = {
      async translate() {
        return "";
      },
      destroyCalls: 0,
      destroy() {
        this.destroyCalls += 1;
      },
    };
    emptySessions.push(session);
    return session;
  },
}));

assert.equal(await emptyTranslator.translateText("hello", "en", "vi"), null);
assert.equal(emptySessions[0].destroyCalls, 1);
assert.equal(await emptyTranslator.translateText("hello", "en", "vi"), null);
assert.equal(emptyCreateCalls, 2);

const rawAbortController = new AbortController();
rawAbortController.abort();
const abortRawTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "available";
  },
  async create() {
    return {
      async translate() {
        throw new Error("should not translate with an aborted signal");
      },
      destroy() {},
    };
  },
}));
assert.equal(await abortRawTranslator.translateText("hello", "en", "vi", rawAbortController.signal), null);

let sameLanguageCreateCalls = 0;
const sameLanguageTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    throw new Error("should not check availability for same-language text");
  },
  async create() {
    sameLanguageCreateCalls += 1;
    throw new Error("should not create a session for same-language text");
  },
}));
assert.equal(await sameLanguageTranslator.translateText("  hello  ", "en", "en"), "hello");
assert.equal(sameLanguageCreateCalls, 0);

const unavailableTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "unavailable";
  },
  async create() {
    throw new Error("should not create when unavailable");
  },
}));
assert.equal(
  await unavailableTranslator.translate(sourceEntry, "vi", new AbortController().signal),
  null,
);

let retryCreateCalls = 0;
const retryTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "available";
  },
  async create() {
    retryCreateCalls += 1;
    if (retryCreateCalls === 1) {
      throw new Error("session creation failed");
    }
    return {
      async translate(input) {
        return `VI:${input}`;
      },
      destroy() {},
    };
  },
}));
await retryTranslator.warm("vi");
await retryTranslator.warm("vi");
assert.equal(retryCreateCalls, 2);

const abortController = new AbortController();
abortController.abort();
const abortedTranslation = await translateDictionaryEntryWithSession(
  sourceEntry,
  "vi",
  fakeSession,
  abortController.signal,
);
assert.equal(abortedTranslation, null);

const failureSession = {
  async translate(input) {
    if (input === "run fast") return "";
    return `VI:${input}`;
  },
  destroyCalls: 0,
  destroy() {
    this.destroyCalls += 1;
  },
};
const failureTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "available";
  },
  async create() {
    return failureSession;
  },
}));
assert.equal(await failureTranslator.translate(sourceEntry, "vi", new AbortController().signal), null);
assert.equal(failureSession.destroyCalls, 1);

const destroySessions = [];
const destroyTranslator = new BrowserDictionaryTranslator(() => ({
  async availability() {
    return "available";
  },
  async create() {
    const session = {
      async translate(input) {
        return `VI:${input}`;
      },
      destroyCalls: 0,
      destroy() {
        this.destroyCalls += 1;
      },
    };
    destroySessions.push(session);
    return session;
  },
}));
await destroyTranslator.warm("vi");
await destroyTranslator.warm("zh-CN");
await destroyTranslator.translateText("xin chào", "vi", "en");
await destroyTranslator.destroy();
assert.equal(destroySessions.length, 3);
assert.equal(destroySessions[0].destroyCalls, 1);
assert.equal(destroySessions[1].destroyCalls, 1);
assert.equal(destroySessions[2].destroyCalls, 1);

console.log("PASS: browser translator adapter contracts cover mapping, pair deduping, raw text, retry, and cleanup.");
