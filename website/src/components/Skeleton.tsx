"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

type Dimension = number | string;

/**
 * Reusable shimmer/pulse placeholder primitive.
 *
 * Renders a `div` with the shared `.corro-skeleton` shimmer animation.
 * Both the conversations list and the model list build their skeleton
 * rows on top of this single component.
 */
export function Skeleton({
  width,
  height,
  borderRadius,
  delay,
  className,
  style,
}: {
  width?: Dimension;
  height?: Dimension;
  borderRadius?: Dimension;
  /** Stagger the shimmer, e.g. `"120ms"` or `120`. */
  delay?: Dimension;
  className?: string;
  style?: CSSProperties;
}) {
  const resolved: CSSProperties = { ...style };
  if (width !== undefined) resolved.width = width;
  if (height !== undefined) resolved.height = height;
  if (borderRadius !== undefined) resolved.borderRadius = borderRadius;
  if (delay !== undefined) {
    resolved.animationDelay = typeof delay === "number" ? `${delay}ms` : delay;
  }
  return (
    <div
      aria-hidden
      className={clsx("corro-skeleton", className)}
      style={resolved}
    />
  );
}
