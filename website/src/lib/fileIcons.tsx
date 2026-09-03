import {
  File,
  FileArchive,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileType2,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

interface FileKind {
  icon: LucideIcon;
  color: string;
}

const EXTENSION_KINDS: Record<string, FileKind> = {
  md: { icon: FileText, color: "text-blue-500" },
  mdx: { icon: FileText, color: "text-blue-500" },
  txt: { icon: FileText, color: "text-ink-muted" },
  json: { icon: FileJson2, color: "text-amber-500" },
  jsonc: { icon: FileJson2, color: "text-amber-500" },
  yaml: { icon: FileJson2, color: "text-amber-500" },
  yml: { icon: FileJson2, color: "text-amber-500" },
  csv: { icon: FileSpreadsheet, color: "text-emerald-500" },
  tsv: { icon: FileSpreadsheet, color: "text-emerald-500" },
  xlsx: { icon: FileSpreadsheet, color: "text-emerald-500" },
  ts: { icon: FileCode2, color: "text-sky-500" },
  tsx: { icon: FileCode2, color: "text-sky-500" },
  js: { icon: FileCode2, color: "text-yellow-500" },
  jsx: { icon: FileCode2, color: "text-yellow-500" },
  py: { icon: FileCode2, color: "text-blue-400" },
  go: { icon: FileCode2, color: "text-cyan-500" },
  rs: { icon: FileCode2, color: "text-orange-500" },
  java: { icon: FileCode2, color: "text-red-500" },
  c: { icon: FileCode2, color: "text-indigo-500" },
  cpp: { icon: FileCode2, color: "text-indigo-500" },
  sh: { icon: FileCode2, color: "text-ink-muted" },
  bash: { icon: FileCode2, color: "text-ink-muted" },
  html: { icon: FileCode2, color: "text-orange-500" },
  css: { icon: FileCode2, color: "text-violet-500" },
  sql: { icon: FileCode2, color: "text-pink-500" },
  log: { icon: FileText, color: "text-ink-muted" },
  pdf: { icon: FileType2, color: "text-red-500" },
  doc: { icon: FileType2, color: "text-blue-600" },
  docx: { icon: FileType2, color: "text-blue-600" },
  png: { icon: ImageIcon, color: "text-purple-500" },
  jpg: { icon: ImageIcon, color: "text-purple-500" },
  jpeg: { icon: ImageIcon, color: "text-purple-500" },
  gif: { icon: ImageIcon, color: "text-purple-500" },
  svg: { icon: ImageIcon, color: "text-purple-500" },
  webp: { icon: ImageIcon, color: "text-purple-500" },
  zip: { icon: FileArchive, color: "text-ink-muted" },
  tar: { icon: FileArchive, color: "text-ink-muted" },
  gz: { icon: FileArchive, color: "text-ink-muted" },
};

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

export function FileTypeIcon({
  path,
  size = 13,
  className,
}: {
  path: string;
  size?: number;
  className?: string;
}) {
  const kind = EXTENSION_KINDS[fileExtension(path)];
  const Icon = kind?.icon ?? File;
  return (
    <Icon
      size={size}
      className={`shrink-0 ${kind?.color ?? "text-ink-muted"} ${className ?? ""}`}
    />
  );
}
