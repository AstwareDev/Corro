"use client";

import { useEffect, useState } from "react";




export function useElapsed(startedAt: number, endedAt?: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endedAt]);

  return (endedAt ?? now) - startedAt;
}
