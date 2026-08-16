import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "../src/components/dictionary/MarkdownContent.ts";

const markdown = `## Heading

**bold** *italic* ~~deleted~~ \`inline\`

- item
- [x] complete

| A | B |
| - | - |
| 1 | 2 |

\`\`\`ts
const value = 1;
\`\`\`

[safe link](https://example.com)

<script>window.__unsafe = true</script>`;

const html = renderToStaticMarkup(createElement(MarkdownContent, { children: markdown }));

for (const tag of ["h2", "strong", "em", "del", "code", "ul", "table", "pre"]) {
  assert.match(html, new RegExp(`<${tag}(?:\\s|>)`), `Markdown should render <${tag}>`);
}
assert.match(html, /<input[^>]+type="checkbox"/);
assert.match(html, /<a[^>]+target="_blank"/);
assert.match(html, /<a[^>]+rel="[^"]*noreferrer[^"]*noopener[^"]*"/);
assert.doesNotMatch(html, /<script(?:\s|>)/);

console.log("PASS: Markdown and GFM render semantic, safe HTML.");
