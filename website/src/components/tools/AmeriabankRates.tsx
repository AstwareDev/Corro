"use client";

import { ArrowRight } from "lucide-react";

export interface AmeriabankRateSide {
  buy?: number;
  sell?: number;
}

export interface AmeriabankRate {
  code: string;
  cash: AmeriabankRateSide;
  nonCash: AmeriabankRateSide;
}

export interface AmeriabankConversionLeg {
  code: string;
  converted: number;
  rate: number;
  note: string;
}

export interface AmeriabankConversion {
  amount: number;
  from: string;
  cash: boolean;
  results: AmeriabankConversionLeg[];
}

export interface AmeriabankResult {
  bank: string;
  url: string;
  date: string;
  base: string;
  rates: AmeriabankRate[];
  conversion?: AmeriabankConversion;
  source: string;
}

function formatRate(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
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

function RateCell({ value }: { value?: number }) {
  if (value === undefined) {
    return <span className="text-ink-muted/50">—</span>;
  }
  return <span className="tabular-nums">{formatRate(value)}</span>;
}

const GRID =
  "grid grid-cols-[2.75rem_repeat(4,minmax(0,1fr))] items-baseline gap-x-2";

function RatesTable({ rates }: { rates: AmeriabankRate[] }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <div className="min-w-[26rem] space-y-1">
        <div className={`${GRID} text-caption text-ink-muted`}>
          <span />
          <span className="text-center">Cash buy</span>
          <span className="text-center">Cash sell</span>
          <span className="text-center">Non-cash buy</span>
          <span className="text-center">Non-cash sell</span>
        </div>
        {rates.map((r) => (
          <div
            key={r.code}
            className={`${GRID} rounded-lg px-1 py-0.5 text-footnote odd:bg-surface-raised`}
          >
            <span className="font-medium tabular-nums text-ink">{r.code}</span>
            <span className="text-center text-ink">
              <RateCell value={r.cash.buy} />
            </span>
            <span className="text-center text-ink">
              <RateCell value={r.cash.sell} />
            </span>
            <span className="text-center text-ink">
              <RateCell value={r.nonCash.buy} />
            </span>
            <span className="text-center text-ink">
              <RateCell value={r.nonCash.sell} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AmeriabankRates({ data }: { data: AmeriabankResult }) {
  const conversion = data.conversion;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      {conversion && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-footnote text-ink-muted">
            <span className="font-medium tabular-nums text-ink">
              {formatAmount(conversion.amount)} {conversion.from}
            </span>
            <ArrowRight size={13} className="shrink-0" />
            <span className="truncate">
              at {conversion.cash ? "cash" : "non-cash"} rates
            </span>
          </div>
          <div className="space-y-1.5">
            {conversion.results.map((leg, i) => (
              <div key={leg.code}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span
                      className={
                        i === 0
                          ? "text-title font-semibold tabular-nums text-ink"
                          : "text-footnote font-medium tabular-nums text-ink"
                      }
                    >
                      {formatAmount(leg.converted)}
                    </span>
                    <span className="text-footnote font-medium text-ink-muted">
                      {leg.code}
                    </span>
                  </div>
                </div>
                <p className="truncate text-caption text-ink-muted">
                  {leg.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <RatesTable rates={data.rates} />

      <p className="text-caption text-ink-muted">
        {data.bank} retail rates per 1 unit in {data.base} as of {data.date} ·{" "}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-citation hover:underline"
        >
          {data.source}
        </a>
      </p>
    </div>
  );
}
