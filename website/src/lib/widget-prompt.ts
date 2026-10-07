export const WIDGET_PROMPT = "corro:widget-prompt";

export function requestWidgetPrompt(text: string) {
  window.dispatchEvent(new CustomEvent(WIDGET_PROMPT, { detail: { text } }));
}

export function onWidgetPrompt(listener: (text: string) => void) {
  const handler = (event: Event) => {
    const text = (event as CustomEvent).detail?.text;
    if (typeof text === "string" && text.trim()) listener(text.trim());
  };
  window.addEventListener(WIDGET_PROMPT, handler);
  return () => window.removeEventListener(WIDGET_PROMPT, handler);
}
