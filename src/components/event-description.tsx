import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

// Only web links survive; anything else (javascript:, data:, mailto:) is
// blanked. Applied to every URL attribute, including image sources.
const urlTransform: UrlTransform = (url) => {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
};

const components: Components = {
  a: ({ href, children }) =>
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
    ),
  // Images never load; the alt text stands in so nothing is fetched.
  img: ({ alt }) => <span className="text-hint">[{alt || "image"}]</span>,
  h1: ({ children }) => (
    <h3 className="mt-4 mb-2 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h5>
  ),
  h4: ({ children }) => (
    <h6 className="mt-3 mb-1 text-sm font-medium first:mt-0">{children}</h6>
  ),
  h5: ({ children }) => (
    <h6 className="mt-3 mb-1 text-sm font-medium first:mt-0">{children}</h6>
  ),
  h6: ({ children }) => (
    <h6 className="mt-3 mb-1 text-sm font-medium first:mt-0">{children}</h6>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-edge-strong pl-3 text-muted">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-raised px-1 text-[0.9em]">
      {children}
    </code>
  ),
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
