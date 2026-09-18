/**
 * Convert LaTeX bracket math delimiters to the dollar syntax remark-math
 * parses: `\[...\]` (display) and `\(...\)` (inline).
 *
 * Fenced code blocks, unclosed trailing fences (streaming) and inline code
 * spans are left untouched so LaTeX *source examples* stay literal.
 * An opener/closer preceded by a backslash (`\\[`) is an escaped literal,
 * not math, and is also left alone.
 */

const FENCE_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const LONE_FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/m;
const INLINE_CODE_RE = /(`+[\s\S]*?`+)/g;
// Lookbehinds (not consumed) so adjacent equations don't eat each other.
const DISPLAY_RE = /(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g;
const INLINE_RE = /(?<!\\)\\\((.+?)(?<!\\)\\\)/g;

function convertProse(segment: string): string {
  return segment
    .replace(
      DISPLAY_RE,
      (whole, content: string, offset: number, str: string) => {
        if (!/\S/.test(content)) return whole;
        // Display math is block-level: isolate the fences on their own lines
        // when the equation sits mid-paragraph.
        const atLineStart = offset === 0 || str[offset - 1] === "\n";
        const afterEnd = offset + whole.length;
        const atLineEnd = afterEnd >= str.length || str[afterEnd] === "\n";
        return `${atLineStart ? "" : "\n"}$$\n${content}\n$$${atLineEnd ? "" : "\n"}`;
      },
    )
    .replace(INLINE_RE, (whole, content: string) =>
      /\S/.test(content) && !content.includes("\n") ? `$${content}$` : whole,
    );
}

function convertOutsideInlineCode(segment: string): string {
  return segment
    .split(INLINE_CODE_RE)
    .map((part, i) => (i % 2 === 1 ? part : convertProse(part)))
    .join("");
}

export function convertMathBrackets(text: string): string {
  const parts = text.split(FENCE_RE);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      // A trailing fence opener with no closer yet (streaming): everything
      // from it on is still code.
      if (i === parts.length - 1) {
        const lone = part.search(LONE_FENCE_RE);
        if (lone !== -1) {
          return (
            convertOutsideInlineCode(part.slice(0, lone)) + part.slice(lone)
          );
        }
      }
      return convertOutsideInlineCode(part);
    })
    .join("");
}
