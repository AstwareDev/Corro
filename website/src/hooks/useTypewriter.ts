"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionPreference } from "@/lib/appearance";

/** Characters per second when the reveal has caught up with the stream. */
const BASE_RATE = 55;
/** Extra characters per second for every character still queued up. */
const CATCHUP_RATE = 7;

/**
 * Reveals `text` progressively instead of snapping to whatever the stream has
 * buffered. The reveal keeps running after the stream ends, so a response that
 * arrives in one burst still reads as typed out.
 *
 * `resetKey` restarts the reveal — pass the id of the block being rendered.
 */
export function useTypewriter(
  text: string,
  animate: boolean,
  resetKey: string,
): { shown: string; complete: boolean } {
  const motionOff = useMotionPreference();
  const instant = !animate || motionOff;

  const [count, setCount] = useState(() => (instant ? text.length : 0));
  const countRef = useRef(count);
  const textRef = useRef(text);
  const keyRef = useRef(resetKey);
  textRef.current = text;

  if (keyRef.current !== resetKey) {
    keyRef.current = resetKey;
    countRef.current = 0;
  }

  useEffect(() => {
    keyRef.current = resetKey;

    if (instant) {
      countRef.current = text.length;
      setCount(countRef.current);
      return;
    }

    if (countRef.current >= text.length) {
      if (countRef.current > text.length) {
        countRef.current = text.length;
        setCount(countRef.current);
      }
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;

      const target = textRef.current.length;
      const remaining = target - countRef.current;
      const rate = BASE_RATE + remaining * CATCHUP_RATE;
      countRef.current = Math.min(
        target,
        countRef.current + Math.max(1, Math.round((rate * dt) / 1000)),
      );
      setCount(countRef.current);

      if (countRef.current < target) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [instant, text, resetKey]);

  const clamped = Math.min(count, text.length);
  return { shown: text.slice(0, clamped), complete: clamped >= text.length };
}
