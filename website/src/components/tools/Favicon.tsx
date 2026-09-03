"use client";

import { Globe } from "lucide-react";
import { useState } from "react";

export function Favicon({ host, size = 16 }: { host: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!host || failed) {
    return <Globe size={size} className="shrink-0 text-ink-muted" />;
  }

  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[3px]"
      style={{ width: size, height: size }}
    />
  );
}
