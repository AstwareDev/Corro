import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeWordSpans } from "@/lib/rehype-word-spans";





const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h1 className="mb-3 mt-5 text-display font-semibold tracking-[-0.01em] text-ink first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 text-title font-semibold tracking-[-0.01em] text-ink first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-prose font-semibold text-ink first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-citation underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-border pl-3 text-ink-muted last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-row border border-border scroll-thin">
      <table className="w-full border-collapse text-left text-footnote">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border bg-surface-raised px-3 py-2 font-medium text-ink-muted">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border px-3 py-2 last:border-b-0">
      {children}
    </td>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <pre className="scroll-thin mb-3 overflow-x-auto rounded-row border border-border bg-surface-raised px-3 py-2.5 font-mono text-footnote leading-relaxed text-ink">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="rounded-[4px] bg-surface-raised px-1 py-0.5 font-mono text-[0.875em] text-ink">
        {children}
      </code>
    );
  },
};

const remarkPlugins = [remarkGfm];
const wordAnimatedRehypePlugins = [rehypeWordSpans];
const noRehypePlugins: [] = [];

export function Markdown({
  text,
  animateWords = false,
}: {
  text: string;
  
  animateWords?: boolean;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={
        animateWords ? wordAnimatedRehypePlugins : noRehypePlugins
      }
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}
