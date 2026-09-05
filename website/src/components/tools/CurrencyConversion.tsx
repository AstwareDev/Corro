"use client";

import { ArrowRight } from "lucide-react";

export interface CurrencyAmount {
  code: string;
  name: string;
  rate: number;
  converted: number;
}

export interface CurrencyResult {
  amount: number;
  from: { code: string; name: string };
  date: string;
  results: CurrencyAmount[];
  source: string;
}

function formatAmount(value: number): string {
  const abs = Math.abs(value);
  const maximumFractionDigits =
    abs === 0 ? 0 : abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

function ResultRow({
  from,
  result,
  emphasis,
}: {
  from: string;
  result: CurrencyAmount;
  emphasis: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={
            emphasis
              ? "text-[17px] font-semibold tabular-nums text-ink"
              : "text-[13px] font-medium tabular-nums text-ink"
          }
        >
          {formatAmount(result.converted)}
        </span>
        <span
          className={
            emphasis
              ? "text-[13px] font-medium text-ink-muted"
              : "text-[11px] text-ink-muted"
          }
        >
          {result.code}
        </span>
      </div>
      <span className="shrink-0 truncate text-[10px] text-ink-muted">
        1 {from} = {formatAmount(result.rate)} {result.code}
      </span>
    </div>
  );
}

export function CurrencyConversion({ data }: { data: CurrencyResult }) {
  const [primary, ...rest] = data.results;
  if (!primary) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-[13px] text-ink-muted">
        <span className="font-medium tabular-nums text-ink">
          {formatAmount(data.amount)} {data.from.code}
        </span>
        <ArrowRight size={13} className="shrink-0" />
        <span className="truncate">
          {data.from.name} → {data.results.map((r) => r.name).join(", ")}
        </span>
      </div>

      <div className="space-y-2">
        <ResultRow from={data.from.code} result={primary} emphasis />
        {rest.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-2">
            {rest.map((r) => (
              <ResultRow
                key={r.code}
                from={data.from.code}
                result={r}
                emphasis={false}
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-ink-muted">
        Rates as of {data.date} · {data.source}
      </p>
    </div>
  );
}
