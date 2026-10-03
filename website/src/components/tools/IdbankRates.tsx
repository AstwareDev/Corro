"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

export interface IdbankRate {
  code: string;
  unit: number;
  buy?: number;
  sell?: number;
}

export interface IdbankBoard {
  kind: string;
  updated?: string;
  rates: IdbankRate[];
}

export interface IdbankConversionLeg {
  code: string;
  converted: number;
  rate: number;
  note: string;
}

export interface IdbankConversion {
  amount: number;
  from: string;
  kind: string;
  results: IdbankConversionLeg[];
}

export interface IdbankResult {
  bank: string;
  url: string;
  updated?: string;
  date: string;
  base: string;
  boards: IdbankBoard[];
  conversion?: IdbankConversion;
  source: string;
}

const KIND_LABELS: Record<string, string> = {
  cash: "Cash",
  "non-cash": "Non-cash",
  cards: "Cards",
  transfer: "Transfer",
  mobile: "Mobile",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function formatRate(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 4,
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

export function IdbankRates({ data }: { data: IdbankResult }) {
  const boards = data.boards;
  const conversion = data.conversion;
  const [active, setActive] = useState<string>(() => {
    if (conversion && boards.some((b) => b.kind === conversion.kind)) {
      return conversion.kind;
    }
    const cash = boards.find((b) => b.kind === "cash");
    return cash?.kind ?? boards[0]?.kind ?? "";
  });
  const board = boards.find((b) => b.kind === active) ?? boards[0];
  if (!board) return null;

  const stamp = board.updated ?? data.updated ?? data.date;

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
              at {kindLabel(conversion.kind).toLowerCase()} rates
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

      {boards.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {boards.map((b) => (
            <button
              key={b.kind}
              type="button"
              onClick={() => setActive(b.kind)}
              className={
                b.kind === board.kind
                  ? "rounded-full bg-surface-raised px-2.5 py-1 text-caption font-medium text-ink"
                  : "rounded-full px-2.5 py-1 text-caption text-ink-muted hover:text-ink"
              }
            >
              {kindLabel(b.kind)}
            </button>
          ))}
        </div>
      )}

      <div className="scroll-thin overflow-x-auto">
        <div className="min-w-[18rem] space-y-1">
          <div className="grid grid-cols-[3.5rem_repeat(2,minmax(0,1fr))] items-baseline gap-x-2 text-caption text-ink-muted">
            <span />
            <span className="text-center">Buy</span>
            <span className="text-center">Sell</span>
          </div>
          {board.rates.map((r) => (
            <div
              key={r.code}
              className="grid grid-cols-[3.5rem_repeat(2,minmax(0,1fr))] items-baseline gap-x-2 rounded-lg px-1 py-0.5 text-footnote odd:bg-surface-raised"
            >
              <span className="font-medium tabular-nums text-ink">
                {r.code}
                {r.unit !== 1 && (
                  <span className="ml-1 font-normal text-caption text-ink-muted">
                    · {r.unit}
                  </span>
                )}
              </span>
              <span className="text-center text-ink">
                <RateCell value={r.buy} />
              </span>
              <span className="text-center text-ink">
                <RateCell value={r.sell} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-caption text-ink-muted">
        {data.bank} {kindLabel(board.kind).toLowerCase()} rates per 1 unit in{" "}
        {data.base} · {stamp} ·{" "}
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
