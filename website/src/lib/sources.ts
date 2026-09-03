import type { ChatMessageUI } from "./types";

export interface Source {
  url: string;
  host: string;
  title: string;
  
  hits: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}






export function collectSources(messages: ChatMessageUI[]): Source[] {
  const found = new Map<string, Source>();

  const add = (url: unknown, title: unknown) => {
    if (typeof url !== "string" || !url.startsWith("http")) return;
    const existing = found.get(url);
    if (existing) {
      existing.hits += 1;
      if (
        existing.title === existing.host &&
        typeof title === "string" &&
        title
      ) {
        existing.title = title;
      }
      return;
    }
    const host = hostOf(url);
    found.set(url, {
      url,
      host,
      title: typeof title === "string" && title ? title : host || url,
      hits: 1,
    });
  };

  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.kind !== "tools") continue;
      for (const call of block.calls) {
        const out = call.output as Record<string, unknown> | undefined;
        if (!out || typeof out !== "object") continue;

        
        if (Array.isArray(out.results)) {
          for (const r of out.results as Array<Record<string, unknown>>) {
            add(r.url, r.title);
          }
        }
        
        if (Array.isArray(out.pages)) {
          for (const p of out.pages as Array<Record<string, unknown>>) {
            add(p.url, p.title);
          }
        }
        
        if (Array.isArray(out.urls)) {
          for (const u of out.urls as unknown[]) add(u, undefined);
        }
      }
    }
  }

  return [...found.values()];
}
