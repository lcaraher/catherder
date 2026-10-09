import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

// Limit on the short description, in characters as readers see them.
export const SHORT_DESCRIPTION_MAX_LENGTH = 400;

// Limit on the stored Markdown, links and formatting marks included.
export const SHORT_DESCRIPTION_STORED_MAX_LENGTH = 2_000;

const parser = unified().use(remarkParse).use(remarkGfm);

interface MarkdownNode {
  type: string;
  value?: string;
  alt?: string | null;
  url?: string;
  children?: MarkdownNode[];
}

// Blocks that hold a line of reader text.
const TEXT_BLOCKS = new Set(["paragraph", "heading"]);

/** Characters a reader sees: text and inline code, one per line break and between blocks. */
export function shortDescriptionLength(markdown: string): number {
  let characters = 0;
  let blocks = 0;
  const visit = (node: MarkdownNode) => {
    if (node.type === "text" || node.type === "inlineCode") characters += node.value?.length ?? 0;
    else if (node.type === "break") characters += 1;
    if (TEXT_BLOCKS.has(node.type)) blocks += 1;
    node.children?.forEach(visit);
  };
  visit(parser.parse(markdown) as MarkdownNode);
  return characters + Math.max(0, blocks - 1);
}

// Text a reader sees; a run of only emphasis marks (a stray "**") is leftover formatting.
const VISIBLE_TEXT = /[^\s*_~]/;

/** Whether the Markdown shows a reader nothing: no text, inline code, code block or image. */
export function isBlankMarkdown(markdown: string): boolean {
  const shows = (node: MarkdownNode): boolean => {
    if (node.type === "text" || node.type === "html") return VISIBLE_TEXT.test(node.value ?? "");
    if (node.type === "inlineCode" || node.type === "code") return (node.value ?? "").trim() !== "";
    if (node.type === "image") return (node.alt ?? "").trim() !== "" || (node.url ?? "") !== "";
    return node.children?.some(shows) ?? false;
  };
  return !shows(parser.parse(markdown) as MarkdownNode);
}
