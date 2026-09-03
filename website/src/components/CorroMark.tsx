const RAYS = [
  "M500 60L500 940",
  "M948.4 60L500 940",
  "M51.6 60L500 940",
  "M596.6 537.5L500 940",
  "M403.4 537.5L500 940",
  "M692.9 714.1L500 940",
  "M307.1 714.1L500 940",
];

export function CorroMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      fill="none"
      stroke="currentColor"
      strokeWidth={42}
      strokeLinecap="round"
      role="img"
      aria-label="Corro"
      className={className}
    >
      <path d={RAYS.join("")} />
    </svg>
  );
}

export function CorroMarkLoading({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      fill="none"
      stroke="currentColor"
      strokeWidth={56}
      strokeLinecap="round"
      role="img"
      aria-label="Working"
      className={`corro-mark-loading ${className ?? ""}`}
    >
      {RAYS.map((d) => (
        <path key={d} d={d} pathLength={1} />
      ))}
    </svg>
  );
}
