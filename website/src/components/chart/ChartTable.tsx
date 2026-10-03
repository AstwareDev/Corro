"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartSpec } from "./chartSpec";
import { cellText, toTableColumns } from "./formatters";

export function ChartTable({ spec }: { spec: ChartSpec }) {
  const columns = toTableColumns(spec);
  const format = spec.y?.format;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  function checkOverflow() {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }

  useEffect(() => {
    checkOverflow();
  });

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={checkOverflow}
        className="chart-scroll h-full overflow-auto"
      >
        <table className="w-full min-w-[420px] table-fixed border-collapse text-left">
          <caption className="sr-only">
            Data table for chart {spec.title}
          </caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="border-b border-border px-3 py-2 text-left text-[13px] font-normal text-ink-muted"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.data.map((row) => {
              const rowKey = columns
                .map((c) => String(row[c.key] ?? ""))
                .join("|");
              return (
                <tr key={rowKey} className="h-11">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`border-b border-border px-3 py-2 text-left text-[14px] text-ink ${
                        col.numeric ? "font-mono tabular-nums" : ""
                      }`}
                    >
                      {cellText(row, col, format)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMoreBelow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--corro-surface)] to-transparent"
        />
      )}
    </div>
  );
}
