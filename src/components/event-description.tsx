import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Checkbox } from "@/components/form-controls";

const remarkPlugins = [remarkGfm];

// Only web links survive; anything else (javascript:, data:, mailto:) is
// blanked. Applied to every URL attribute, including image sources.
export const urlTransform: UrlTransform = (url) => {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
};

// Whether a child is the element react-markdown made for one of these tags.
function isTag(
  child: ReactNode,
  tags: string[],
): child is ReactElement<{ children?: ReactNode }> {
  if (!isValidElement<{ node?: { tagName?: string } }>(child)) return false;
  return tags.includes(child.props.node?.tagName ?? "");
}

// A checklist item: its box named by the item's own text, nested lists left out of the name.
function labelTask(children: ReactNode, id: string): ReactNode[] {
  const kids = Children.toArray(children);
  const box = kids.findIndex((kid) => isTag(kid, ["input"]));
  if (box < 0) {
    // In a loose list the box sits in the item's first paragraph.
    const first = kids.findIndex((kid) => isTag(kid, ["p"]));
    if (first < 0) return kids;
    const paragraph = kids[first] as ReactElement<{ children?: ReactNode }>;
    kids[first] = cloneElement(
      paragraph,
      {},
      labelTask(paragraph.props.children, id),
    );
    return kids;
  }
  const lists = kids.filter((kid) => isTag(kid, ["ul", "ol"]));
  const text = kids.filter(
    (kid, index) => index !== box && !isTag(kid, ["ul", "ol"]),
  );
  return [
    cloneElement(kids[box] as ReactElement<{ "aria-labelledby"?: string }>, {
      "aria-labelledby": id,
    }),
    <span key="text" id={id}>
      {text}
    </span>,
    // Nested items line up under the item's text.
    ...(lists.length > 0
      ? [
          <div key="lists" className="pl-5.5">
            {lists}
          </div>,
        ]
      : []),
  ];
}

// A link opens in a new tab; one whose address was blanked shows as underlined text.
export const linkRenderer: Components["a"] = ({ href, children }) =>
  href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-muted"
    >
      {children}
    </a>
  ) : (
    <span className="underline">{children}</span>
  );

export const codeRenderer: Components["code"] = ({ children }) => (
  <code className="rounded bg-surface-raised px-1 code-size break-all">{children}</code>
);

const components: Components = {
  a: linkRenderer,
  // Images never load; the alt text stands in so nothing is fetched.
  img: ({ alt }) => <span className="text-hint">[{alt || "image"}]</span>,
  h1: ({ children }) => (
    <h3 className="font-heading mt-4 mb-2 text-lg font-semibold first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className="font-heading mt-4 mb-2 text-base font-semibold first:mt-0">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className="font-heading mt-3 mb-1 text-sm font-semibold first:mt-0">
      {children}
    </h5>
  ),
  h4: ({ children }) => (
    <h6 className="font-heading mt-3 mb-1 text-sm font-medium first:mt-0">
      {children}
    </h6>
  ),
  h5: ({ children }) => (
    <h6 className="font-heading mt-3 mb-1 text-sm font-medium first:mt-0">
      {children}
    </h6>
  ),
  h6: ({ children }) => (
    <h6 className="font-heading mt-3 mb-1 text-sm font-medium first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ className, children }) =>
    className?.includes("contains-task-list") ? (
      <ul className="my-2 list-none pl-0 first:mt-0 last:mb-0">{children}</ul>
    ) : (
      <ul className="my-2 list-disc pl-5 first:mt-0 last:mb-0">{children}</ul>
    ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ className, children, node }) =>
    className?.includes("task-list-item") ? (
      <li className="my-0.5 list-none">
        {labelTask(
          children,
          `description-task-${node?.position?.start.offset ?? 0}`,
        )}
      </li>
    ) : (
      <li className="my-0.5">{children}</li>
    ),
  // A checklist box: the app's checkbox, read-only, ticked as in the text.
  input: ({ type, checked, "aria-labelledby": labelledBy }) =>
    type === "checkbox" ? (
      <span className="full-strength mr-1.5 inline-flex align-middle">
        <Checkbox
          disabled
          checked={Boolean(checked)}
          aria-labelledby={labelledBy}
        />
      </span>
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-edge-strong pl-3 text-muted">
      {children}
    </blockquote>
  ),
  code: codeRenderer,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded border border-edge bg-surface-raised p-2 text-xs">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-3 border-edge" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-edge px-2 py-1 text-left font-small font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-edge px-2 py-1">{children}</td>
  ),
};

/** Renders an event's Markdown description; raw HTML shows as text. */
export function EventDescription({ text }: { text: string }) {
  return (
    <div className="text-sm break-words">
      <Markdown
        remarkPlugins={remarkPlugins}
        urlTransform={urlTransform}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
}
