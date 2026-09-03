import type { Element, ElementContent, Root, Text } from "hast";
import { visit } from "unist-util-visit";



export function rehypeWordSpans() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (parent == null || index == null) return;
      if (parent.type === "element" && parent.tagName === "code") return;

      const parts = node.value.split(/(\s+)/).filter(Boolean);
      if (parts.length <= 1 && !/\s/.test(node.value)) return;

      const replacement: ElementContent[] = parts.map((part) => {
        if (/^\s+$/.test(part)) return { type: "text", value: part };
        const span: Element = {
          type: "element",
          tagName: "span",
          properties: { className: ["word-token"] },
          children: [{ type: "text", value: part }],
        };
        return span;
      });

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}
