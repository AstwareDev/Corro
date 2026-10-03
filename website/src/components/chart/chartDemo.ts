"use client";

/** Demo message set covering every chart state — paste each `markdown` into
 *  chat (or render via <Markdown text={...} />) to review quickly. */
export interface ChartDemo {
  name: string;
  markdown: string;
  streaming?: boolean;
  note: string;
}

const LINE = `Revenue trend is below.

\`\`\`chart
{"type": "line", "title": "Revenue by month", "subtitle": "Q1 2026", "x": {"key": "month", "label": "Month"}, "y": {"label": "Revenue (USD)", "format": "currency", "min": 0}, "series": [{"key": "revenue", "name": "Revenue"}, {"key": "cost", "name": "Cost"}], "data": [{"month": "Jan", "revenue": 12000, "cost": 8000}, {"month": "Feb", "revenue": 18500, "cost": 9200}, {"month": "Mar", "revenue": 17400, "cost": 10100}]}
\`\`\`

Takeaway: revenue outpaced cost every month.`;

const BAR = `Signups by plan:

\`\`\`chart
{"type": "bar", "title": "Signups by plan", "x": {"key": "plan", "label": "Plan"}, "y": {"label": "Signups", "format": "number", "min": 0}, "series": [{"key": "signups", "name": "Signups"}], "data": [{"plan": "Free", "signups": 1240}, {"plan": "Pro", "signups": 860}, {"plan": "Team", "signups": 310}], "table": {"show": true, "defaultView": "table"}}
\`\`\`

Takeaway: Free dominates, Team trails.`;

const SCATTER = `Latency vs load:

\`\`\`chart
{"type": "scatter", "title": "Latency vs load", "x": {"key": "rps", "label": "Requests/s", "scale": "linear"}, "y": {"label": "p95 latency (ms)", "format": "number"}, "series": [{"key": "p95", "name": "p95"}], "data": [{"rps": 50, "p95": 120}, {"rps": 100, "p95": 140}, {"rps": 200, "p95": 210}, {"rps": 400, "p95": 380}]}
\`\`\`

Takeaway: latency climbs steeply past 200 rps.`;

const AREA = `Stacked traffic:

\`\`\`chart
{"type": "area", "title": "Traffic by channel", "x": {"key": "week", "label": "Week"}, "y": {"label": "Visits", "format": "compact"}, "series": [{"key": "organic", "name": "Organic"}, {"key": "paid", "name": "Paid"}], "stacked": true, "data": [{"week": "W1", "organic": 4200, "paid": 1800}, {"week": "W2", "organic": 5100, "paid": 2200}]}
\`\`\`

Takeaway: organic drives most growth.`;

const PIE = `Share of feedback:

\`\`\`chart
{"type": "pie", "title": "Feedback by topic", "x": {"key": "topic", "label": "Topic"}, "series": [{"key": "count", "name": "Reports"}], "data": [{"topic": "Pricing", "count": 42}, {"topic": "Speed", "count": 31}, {"topic": "Design", "count": 18}]}
\`\`\`

Takeaway: pricing is the top topic.`;

const INVALID = `Broken spec falls back to code:

\`\`\`chart
{"type": "line", "title": "", "series": [], "data": []}
\`\`\``;

const PARTIAL = '```chart\n{"type": "line", "title": "Revenue by mo';

export const CHART_DEMOS: ChartDemo[] = [
  {
    name: "line",
    markdown: LINE,
    note: "Multi-series line with currency formatting",
  },
  { name: "bar", markdown: BAR, note: "Bar defaulting to the table view" },
  { name: "scatter", markdown: SCATTER, note: "Numeric x/y scatter" },
  { name: "area", markdown: AREA, note: "Stacked area with compact numbers" },
  { name: "pie", markdown: PIE, note: "Single-series pie" },
  {
    name: "invalid JSON",
    markdown: INVALID,
    note: "Settled invalid spec shows error + raw JSON",
  },
  {
    name: "partial stream",
    markdown: PARTIAL,
    streaming: true,
    note: "Streaming partial JSON shows a skeleton",
  },
];
