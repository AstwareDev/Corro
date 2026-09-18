import type { Element, ElementContent, Root, Text } from "hast";

/** KaTeX output roots: HTML spans plus MathML. Never split text under these. */
function isMathElement(el: Element): boolean {
  if (el.tagName === "math") return true;
  return (
    Array.isArray(el.properties?.className) &&
    el.properties.className.some(
      (c) =>
        c === "katex" ||
        c === "katex-display" ||
        c === "math-display" ||
        c === "math-inline",
    )
  );
}

function splitWords(node: Text): ElementContent[] {
  return node.value
    .split(/(\s+)/)
    .filter(Boolean)
    .map((part) => {
      if (/^\s+$/.test(part)) return { type: "text", value: part };
      const span: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["word-token"] },
        children: [{ type: "text", value: part }],
      };
      return span;
    });
}

function processChildren(parent: Element | Root, inMath: boolean): void {
  // Like before, only direct text of <code> is exempt (custom code styling).
  const parentIsCode = parent.type === "element" && parent.tagName === "code";
  const kids = parent.children;
  for (let i = 0; i < kids.length; ) {
    const child = kids[i];
    if (child.type === "text" && !inMath && !parentIsCode) {
      const value = child.value;
      if (
        value.split(/(\s+)/).filter(Boolean).length <= 1 &&
        !/\s/.test(value)
      ) {
        i++;
        continue;
      }
      const replacement = splitWords(child);
      kids.splice(i, 1, ...replacement);
      i += replacement.length;
    } else {
      if (child.type === "element") {
        processChildren(child, inMath || isMathElement(child));
      }
      i++;
    }
  }
}

export function rehypeWordSpans() {
  return (tree: Root) => {
    processChildren(tree, false);
  };
}
