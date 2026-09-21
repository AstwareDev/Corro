import type { Element, Root, RootContent } from "hast";

// Groups pure image paragraphs into real layouts. A paragraph whose only
// content is images stops being a <p>: one image becomes a figure (.chat-figure),
// several become a swipeable strip (.chat-carousel). Images mixed into prose or
// table cells are left alone and styled inline by plain CSS.
export function rehypeImageFigures() {
  return (tree: Root) => {
    const walk = (node: Element | Root) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (child.tagName === "p") {
          const images = imagesOnly(child.children);
          if (images.length >= 2) {
            convert(child, "chat-carousel scroll-thin");
          } else if (images.length === 1) {
            convert(child, "chat-figure");
          }
        }
        walk(child);
      }
    };
    walk(tree);
  };
}

function imagesOnly(children: RootContent[]): Element[] {
  const significant = children.filter(
    (n) => !(n.type === "text" && !(n as { value?: string }).value?.trim()),
  );
  const allImages =
    significant.length > 0 &&
    significant.every((n) => n.type === "element" && n.tagName === "img");
  return allImages ? (significant as Element[]) : [];
}

function convert(element: Element, className: string) {
  element.tagName = "div";
  element.properties = {
    ...(element.properties ?? {}),
    className: className.split(" "),
  };
}
