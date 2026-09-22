import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { resolveAssetUrl } from "@/lib/api";
import { convertMathBrackets } from "@/lib/math-brackets";
import { rehypeImageFigures } from "@/lib/rehype-image-figures";
import { rehypeWordSpans } from "@/lib/rehype-word-spans";
import { ClipPlayerProvider, parseClipUrl, YouTubeClip } from "./tools/YouTube";

const components: Components = {
  img: ({ src, alt }) => {
    const href = typeof src === "string" ? resolveAssetUrl(src) : "";
    return (
      <a
        href={href || undefined}
        target="_blank"
        rel="noopener noreferrer"
        title={alt || undefined}
        className="chat-img-link"
      >
        {/* biome-ignore lint/performance/noImgElement: arbitrary remote chat images don't belong to Next image optimisation */}
        <img src={href} alt={alt ?? ""} loading="lazy" className="chat-img" />
      </a>
    );
  },
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
  a: ({ children, href, title }) => {
    // Timestamped YouTube links (?t=) render as playable clip chips.
    const clip = typeof href === "string" ? parseClipUrl(href) : null;
    if (clip) {
      return (
        <YouTubeClip clip={clip} title={title ?? undefined}>
          {children}
        </YouTubeClip>
      );
    }
    return (
      <a
        href={href ? resolveAssetUrl(href) : href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-citation underline underline-offset-2 hover:no-underline"
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-border pl-3 text-ink-muted last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="chat-table mb-3 overflow-x-auto rounded-row border border-border scroll-thin">
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

const remarkPlugins: [[typeof remarkGfm], [typeof remarkMath, { singleDollarTextMath: false }]] = [
  [remarkGfm],
  // Single dollars stay literal text ("$4 and $20"), so prices never parse
  // as inline math. $$…$$ display math (including \[…\] converted by
  // convertMathBrackets) still renders via KaTeX; inline \(…\) now renders
  // literally instead of as math.
  [remarkMath, { singleDollarTextMath: false }],
];
// KaTeX's default \vec arrow is a tiny fixed glyph that reads as a smudge;
// map it to the full-width stretchy arrow physics content expects.
const katexOptions = { macros: { "\\vec": "\\overrightarrow" } };
type KatexPlugin = [typeof rehypeKatex, typeof katexOptions];
// KaTeX first so equations become styled spans before the streaming
// word-splitter runs (which skips KaTeX subtrees — see rehype-word-spans).
const wordAnimatedRehypePlugins = [
  [rehypeKatex, katexOptions] as KatexPlugin,
  rehypeImageFigures,
  rehypeWordSpans,
];
const settledRehypePlugins = [
  [rehypeKatex, katexOptions] as KatexPlugin,
  rehypeImageFigures,
];

export function Markdown({
  text,
  animateWords = false,
}: {
  text: string;

  animateWords?: boolean;
}) {
  // Accept LaTeX bracket delimiters (\[...\], \(...\)) alongside dollars;
  // code blocks/spans are exempt so source examples stay literal.
  const converted = convertMathBrackets(text);
  return (
    <ClipPlayerProvider>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={
          animateWords ? wordAnimatedRehypePlugins : settledRehypePlugins
        }
        components={components}
      >
        {converted}
      </ReactMarkdown>
    </ClipPlayerProvider>
  );
}
