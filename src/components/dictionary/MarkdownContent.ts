import { createElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  children: string;
  className?: string;
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const components: Components = {
  a: ({ node: _node, className, children, ...props }) => createElement("a", {
    ...props,
    className: joinClassNames("font-medium text-primary underline underline-offset-2", className),
    target: "_blank",
    rel: "noreferrer noopener",
  }, children),
  blockquote: ({ node: _node, className, children, ...props }) => createElement("blockquote", {
    ...props,
    className: joinClassNames("my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground", className),
  }, children),
  code: ({ node: _node, className, children, ...props }) => createElement("code", {
    ...props,
    className: joinClassNames("rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]", className),
  }, children),
  h1: ({ node: _node, className, children, ...props }) => createElement("h1", {
    ...props,
    className: joinClassNames("mb-2 mt-4 text-xl font-bold leading-tight first:mt-0", className),
  }, children),
  h2: ({ node: _node, className, children, ...props }) => createElement("h2", {
    ...props,
    className: joinClassNames("mb-2 mt-4 text-lg font-semibold leading-tight first:mt-0", className),
  }, children),
  h3: ({ node: _node, className, children, ...props }) => createElement("h3", {
    ...props,
    className: joinClassNames("mb-1.5 mt-3 text-base font-semibold leading-tight first:mt-0", className),
  }, children),
  h4: ({ node: _node, className, children, ...props }) => createElement("h4", {
    ...props,
    className: joinClassNames("mb-1 mt-3 text-sm font-semibold leading-tight first:mt-0", className),
  }, children),
  ol: ({ node: _node, className, children, ...props }) => createElement("ol", {
    ...props,
    className: joinClassNames("my-2 list-decimal space-y-1 pl-5", className),
  }, children),
  p: ({ node: _node, className, children, ...props }) => createElement("p", {
    ...props,
    className: joinClassNames("my-2 leading-relaxed first:mt-0 last:mb-0", className),
  }, children),
  pre: ({ node: _node, className, children, ...props }) => createElement("div", {
    className: "ext-markdown-code-scroll my-3 max-w-full overflow-x-auto rounded-lg bg-slate-950 p-3 text-slate-50",
  }, createElement("pre", {
    ...props,
    className: joinClassNames("min-w-max whitespace-pre text-xs leading-relaxed", className),
  }, children)),
  table: ({ node: _node, className, children, ...props }) => createElement("div", {
    className: "ext-markdown-table-scroll my-3 max-w-full overflow-x-auto",
  }, createElement("table", {
    ...props,
    className: joinClassNames("w-max min-w-full border-collapse text-left text-xs", className),
  }, children)),
  td: ({ node: _node, className, children, ...props }) => createElement("td", {
    ...props,
    className: joinClassNames("border px-2 py-1.5 align-top", className),
  }, children),
  th: ({ node: _node, className, children, ...props }) => createElement("th", {
    ...props,
    className: joinClassNames("border bg-muted px-2 py-1.5 font-semibold", className),
  }, children),
  ul: ({ node: _node, className, children, ...props }) => createElement("ul", {
    ...props,
    className: joinClassNames("my-2 list-disc space-y-1 pl-5", className),
  }, children),
};

export function MarkdownContent({ children, className }: MarkdownContentProps): ReactNode {
  return createElement("div", {
    className: joinClassNames("ext-markdown min-w-0 max-w-full text-sm leading-relaxed", className),
  }, createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm],
    components,
    skipHtml: true,
  }, children));
}
