import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeRenderer, linkRenderer, urlTransform } from "@/components/event-description";
import { isBlankMarkdown } from "@/domain/short-description";

const remarkPlugins = [remarkGfm];

const ALLOWED = ["p", "strong", "em", "del", "code", "a", "br"];

const components: Components = {
  a: linkRenderer,
  code: codeRenderer,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
};

/** An event's short description for readers, under a rule; nothing when blank. Other Markdown shows as its text. */
export function ShortDescription({ text }: { text: string | null }) {
  if (text === null || isBlankMarkdown(text)) return null;
  return (
    <div className="mt-3 border-t border-edge pt-3 text-sm break-words">
      <Markdown
        remarkPlugins={remarkPlugins}
        urlTransform={urlTransform}
        components={components}
        allowedElements={ALLOWED}
        unwrapDisallowed
      >
        {text}
      </Markdown>
    </div>
  );
}
