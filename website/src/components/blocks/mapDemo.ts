"use client";

/** Demo message set covering the map block, charts, and tables — paste each
 *  `markdown` into chat (or render via <Markdown text={...} />) to review
 *  quickly in light and dark themes, ~640px and 375px wide. */
export interface MapDemo {
  name: string;
  markdown: string;
  streaming?: boolean;
  note: string;
}

const ADDRESS = `The closest option is here:

\`\`\`map
SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan
\`\`\``;

const COORDINATES = `Pinned location from the tool result:

\`\`\`map
40.1772, 44.5126
\`\`\``;

const ZOOM_LABEL = `The closest option is here:

\`\`\`map
SAS Supermarket, Marshal Baghramyan Ave 85, Yerevan
zoom=15 | label=SAS Supermarket
\`\`\``;

const EMPTY = `An empty block renders nothing and never crashes:

\`\`\`map
\`\`\``;

const PARTIAL = "```map\n";

const CHART = `Revenue trend is below.

\`\`\`chart
{"type": "line", "title": "Revenue by month", "x": {"key": "month", "label": "Month"}, "y": {"label": "Revenue (USD)", "format": "currency", "min": 0}, "series": [{"key": "revenue", "name": "Revenue"}], "data": [{"month": "Jan", "revenue": 12000}, {"month": "Feb", "revenue": 18500}, {"month": "Mar", "revenue": 17400}]}
\`\`\`

Takeaway: revenue outpaced January by March.`;

const TABLE = `A normal lookup table:

| Store | Hours |
|---|---|
| SAS Supermarket | 24/7 |
| Yerevan City | Daily 09:00-23:00 |`;

export const MAP_DEMOS: MapDemo[] = [
  { name: "address", markdown: ADDRESS, note: "Map from an address" },
  {
    name: "coordinates",
    markdown: COORDINATES,
    note: "Map from coordinates",
  },
  {
    name: "zoom and label",
    markdown: ZOOM_LABEL,
    note: "Map with zoom and label",
  },
  {
    name: "empty",
    markdown: EMPTY,
    note: "Settled empty block renders nothing",
  },
  {
    name: "partial stream",
    markdown: PARTIAL,
    streaming: true,
    note: "Streaming partial block shows a skeleton",
  },
  { name: "chart", markdown: CHART, note: "Chart still renders as before" },
  { name: "table", markdown: TABLE, note: "Normal table still renders" },
];
