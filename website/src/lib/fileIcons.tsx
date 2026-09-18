const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "ico",
]);

export function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(path));
}

export function ImageFileIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.55566 26.8889C3.55566 28.6071 4.94856 30 6.66678 30H25.3334C27.0517 30 28.4446 28.6071 28.4446 26.8889V9.77778L20.6668 2H6.66678C4.94856 2 3.55566 3.39289 3.55566 5.11111V26.8889Z"
        fill="#4D81E8"
      />
      <path
        d="M20.6685 6.66647C20.6685 8.38469 22.0613 9.77759 23.7796 9.77759H28.4462L20.6685 1.99981V6.66647Z"
        fill="#9CC3F4"
      />
      <path
        opacity="0.9"
        d="M8.77783 21.8333L13.0556 17.5556L16.1667 20.6667L19.2778 17.5556L23.2223 21.8333H8.77783Z"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M19.6665 14.8333C19.6665 15.4777 19.1443 15.9999 18.4998 15.9999C17.8554 15.9999 17.3332 15.4777 17.3332 14.8333C17.3332 14.1888 17.8554 13.6666 18.4998 13.6666C19.1443 13.6666 19.6665 14.1888 19.6665 14.8333Z"
        fill="white"
      />
    </svg>
  );
}

function PageShape({
  fill,
  accent,
  children,
  size,
  className,
}: {
  fill: string;
  accent: string;
  children?: React.ReactNode;
  size: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.55566 26.8889C3.55566 28.6071 4.94856 30 6.66678 30H25.3334C27.0517 30 28.4446 28.6071 28.4446 26.8889V9.77778L20.6668 2H6.66678C4.94856 2 3.55566 3.39289 3.55566 5.11111V26.8889Z"
        fill={fill}
      />
      <path
        d="M20.6685 6.66647C20.6685 8.38469 22.0613 9.77759 23.7796 9.77759H28.4462L20.6685 1.99981V6.66647Z"
        fill={accent}
      />
      {children}
    </svg>
  );
}

interface BadgeSpec {
  fill: string;
  accent: string;
  label?: string;
}

const MARKDOWN_BADGE: BadgeSpec = { fill: "#4D81E8", accent: "#9CC3F4" };

const BADGE_SPECS: Record<string, BadgeSpec> = {
  md: MARKDOWN_BADGE,
  mdx: MARKDOWN_BADGE,
  txt: { fill: "#8A8F98", accent: "#D3D6DA", label: "TXT" },
  log: { fill: "#8A8F98", accent: "#D3D6DA", label: "LOG" },
  json: { fill: "#D6972F", accent: "#F0CE9B", label: "JSON" },
  jsonc: { fill: "#D6972F", accent: "#F0CE9B", label: "JSON" },
  yaml: { fill: "#D6972F", accent: "#F0CE9B", label: "YAML" },
  yml: { fill: "#D6972F", accent: "#F0CE9B", label: "YAML" },
  csv: { fill: "#2FA36B", accent: "#9EDEC0", label: "CSV" },
  tsv: { fill: "#2FA36B", accent: "#9EDEC0", label: "TSV" },
  xlsx: { fill: "#2FA36B", accent: "#9EDEC0", label: "XLS" },
  ts: { fill: "#5B6472", accent: "#B7BEC7", label: "TS" },
  tsx: { fill: "#5B6472", accent: "#B7BEC7", label: "TSX" },
  js: { fill: "#5B6472", accent: "#B7BEC7", label: "JS" },
  jsx: { fill: "#5B6472", accent: "#B7BEC7", label: "JSX" },
  py: { fill: "#5B6472", accent: "#B7BEC7", label: "PY" },
  go: { fill: "#5B6472", accent: "#B7BEC7", label: "GO" },
  rs: { fill: "#5B6472", accent: "#B7BEC7", label: "RS" },
  java: { fill: "#5B6472", accent: "#B7BEC7", label: "JAVA" },
  c: { fill: "#5B6472", accent: "#B7BEC7", label: "C" },
  cpp: { fill: "#5B6472", accent: "#B7BEC7", label: "C++" },
  sh: { fill: "#5B6472", accent: "#B7BEC7", label: "SH" },
  bash: { fill: "#5B6472", accent: "#B7BEC7", label: "SH" },
  html: { fill: "#5B6472", accent: "#B7BEC7", label: "HTML" },
  css: { fill: "#5B6472", accent: "#B7BEC7", label: "CSS" },
  sql: { fill: "#5B6472", accent: "#B7BEC7", label: "SQL" },
  pdf: { fill: "#E24C4C", accent: "#F0A0A0", label: "PDF" },
  doc: { fill: "#2F5FD6", accent: "#9BB4EE", label: "DOC" },
  docx: { fill: "#2F5FD6", accent: "#9BB4EE", label: "DOC" },
  zip: { fill: "#8A8F98", accent: "#D3D6DA", label: "ZIP" },
  tar: { fill: "#8A8F98", accent: "#D3D6DA", label: "TAR" },
  gz: { fill: "#8A8F98", accent: "#D3D6DA", label: "ZIP" },
};

const DEFAULT_BADGE: BadgeSpec = { fill: "#8A8F98", accent: "#D3D6DA" };

function MarkdownGlyph() {
  return (
    <>
      <path
        opacity="0.9"
        d="M10.1685 18.2363H21.8351"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M10.1685 14.3472H12.1129"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M15.0293 14.3472H16.9737"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M10.1685 21.8333H21.8351"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </>
  );
}

export function FileTypeBadge({
  path,
  size = 20,
  className,
}: {
  path: string;
  size?: number;
  className?: string;
}) {
  if (isImageFile(path))
    return <ImageFileIcon size={size} className={className} />;
  const ext = fileExtension(path);
  const spec = BADGE_SPECS[ext] ?? DEFAULT_BADGE;
  const isMarkdown = spec === MARKDOWN_BADGE;
  return (
    <PageShape
      fill={spec.fill}
      accent={spec.accent}
      size={size}
      className={className}
    >
      {isMarkdown ? (
        <MarkdownGlyph />
      ) : (
        spec.label && (
          <text
            x="16"
            y="22.5"
            textAnchor="middle"
            fontSize={spec.label.length > 3 ? 6 : 8}
            fontWeight="700"
            fill="white"
          >
            {spec.label}
          </text>
        )
      )}
    </PageShape>
  );
}

export function fileExtension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function isMarkdownFile(path: string): boolean {
  const ext = fileExtension(path);
  return ext === "md" || ext === "mdx";
}

export function isHtmlFile(path: string): boolean {
  const ext = fileExtension(path);
  return ext === "html" || ext === "htm";
}
