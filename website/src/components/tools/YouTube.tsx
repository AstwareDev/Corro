"use client";

import clsx from "clsx";
import { Captions, Clock, Eye, FileText, MessageSquare, ThumbsUp } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { createContext, useContext, useState } from "react";

export interface YouTubeBrand {
  name: string;
  host: string;
  accent: string;
}

export const YOUTUBE_BRAND: YouTubeBrand = {
  name: "YouTube",
  host: "youtube.com",
  accent: "#ff0033",
};

function accentStyle(brand?: YouTubeBrand): CSSProperties {
  return {
    "--shop-accent": brand?.accent ?? "var(--corro-text)",
  } as CSSProperties;
}

export function formatCount(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("en-US");
}

export function formatDuration(totalSeconds: number | undefined): string | undefined {
  if (totalSeconds === undefined) return undefined;
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

function cueTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

function Thumb({
  src,
  alt,
  badge,
  className,
}: {
  src?: string;
  alt: string;
  badge?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={clsx(
        "relative flex items-center justify-center overflow-hidden rounded-lg bg-black ring-1 ring-border",
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className="text-caption text-white/60">No thumbnail</span>
      )}
      {badge && (
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px font-mono text-caption tabular-nums text-white">
          {badge}
        </span>
      )}
    </div>
  );
}

function Stat({
  Icon,
  value,
  label,
}: {
  Icon: typeof Eye;
  value: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 text-caption tabular-nums text-ink-muted" title={label}>
      <Icon size={11} />
      {value}
    </span>
  );
}

// --- channel ---

export interface YouTubeChannel {
  id: string;
  title: string;
  handle?: string;
  subscriberText?: string;
  subscriberCount?: number;
  description?: string;
  avatar?: string;
  banner?: string;
  joined?: string;
  videoCount?: number;
  url: string;
}

export function YouTubeChannelCard({
  channel,
  brand,
}: {
  channel: YouTubeChannel;
  brand?: YouTubeBrand;
}) {
  const [expanded, setExpanded] = useState(false);
  const about = channel.description ?? "";
  const clipped = about.length > 220 && !expanded;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface" style={accentStyle(brand)}>
      {channel.banner && (
        <img src={channel.banner} alt="" loading="lazy" className="h-20 w-full object-cover" />
      )}
      <div className="flex gap-3 p-2.5">
        {channel.avatar ? (
          <img
            src={channel.avatar}
            alt={channel.title}
            loading="lazy"
            className="size-14 shrink-0 rounded-full ring-1 ring-border"
          />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-raised text-title font-semibold text-ink">
            {channel.title.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <a
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-footnote font-medium leading-snug text-ink hover:underline"
          >
            {channel.title}
          </a>
          <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-caption text-ink-muted">
            {channel.handle && <span>{channel.handle}</span>}
            {channel.subscriberText && <span>· {channel.subscriberText}</span>}
            {channel.subscriberText === undefined && channel.subscriberCount !== undefined && (
              <span>· {formatCount(channel.subscriberCount)} subscribers</span>
            )}
            {channel.videoCount !== undefined && (
              <span>· {channel.videoCount.toLocaleString()} videos</span>
            )}
          </p>
          {channel.joined && <p className="mt-0.5 text-caption text-ink-muted">{channel.joined}</p>}
          {about && (
            <div className="mt-1.5">
              <p className={clsx("whitespace-pre-line text-caption leading-relaxed text-ink", clipped && "line-clamp-2")}>
                {about}
              </p>
              {about.length > 220 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-0.5 text-caption font-medium text-citation hover:underline"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- video grid ---

export interface YouTubeVideoRow {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
  views?: string;
  viewCount?: number;
  published?: string;
  short?: boolean;
}

function VideoCard({ video }: { video: YouTubeVideoRow }) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-2 transition-colors hover:bg-surface-raised"
    >
      <Thumb
        src={video.thumbnail}
        alt={video.title}
        badge={video.duration ?? formatDuration(video.durationSeconds)}
        className="aspect-video w-full"
      />
      {video.short && (
        <span className="absolute left-1 top-1 rounded bg-[color:var(--shop-accent)] px-1 py-px text-caption font-semibold uppercase tracking-wide text-white">
          Short
        </span>
      )}
      <span className="line-clamp-2 text-caption leading-snug text-ink group-hover:underline">
        {video.title}
      </span>
      <span className="text-caption tabular-nums text-ink-muted">
        {[video.views ?? (video.viewCount !== undefined ? `${formatCount(video.viewCount)} views` : undefined), video.published]
          .filter(Boolean)
          .join(" · ") || "youtube.com"}
      </span>
    </a>
  );
}

export function YouTubeVideoGrid({
  videos,
  brand,
  sort,
  tab,
  hasMore,
}: {
  videos: YouTubeVideoRow[];
  brand?: YouTubeBrand;
  sort?: string;
  tab?: string;
  hasMore?: boolean;
}) {
  if (!videos.length) {
    return <p className="text-caption text-ink-muted">This channel has no videos on this tab.</p>;
  }
  return (
    <div className="space-y-2" style={accentStyle(brand)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
      <p className="text-caption text-ink-muted">
        {videos.length} {tab ?? "video"}{videos.length === 1 ? "" : "s"}
        {sort ? ` · ${sort}` : ""}
        {hasMore ? " · more available" : ""} · {brand?.host ?? "youtube.com"}
      </p>
    </div>
  );
}

// --- video detail ---

export interface YouTubeVideo {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  channel?: { id?: string; url?: string; name?: string };
  viewCount?: number;
  viewText?: string;
  likeCount?: number;
  commentCount?: number;
  published?: string;
  publishedRelative?: string;
  durationSeconds?: number;
  category?: string;
  tags?: string[];
  description?: string;
  qualities?: string[];
}

export function YouTubeVideoDetail({
  video,
  brand,
}: {
  video: YouTubeVideo;
  brand?: YouTubeBrand;
}) {
  const [expanded, setExpanded] = useState(false);
  const about = video.description ?? "";
  const clipped = about.length > 400 && !expanded;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-2.5" style={accentStyle(brand)}>
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="block">
        <Thumb
          src={video.thumbnail}
          alt={video.title}
          badge={formatDuration(video.durationSeconds)}
          className="aspect-video w-full"
        />
      </a>
      <div>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-footnote font-medium leading-snug text-ink hover:underline"
        >
          {video.title}
        </a>
        {video.channel?.name && (
          <p className="mt-0.5 text-caption text-ink-muted">
            {video.channel.url ? (
              <a href={video.channel.url} target="_blank" rel="noopener noreferrer" className="text-citation hover:underline">
                {video.channel.name}
              </a>
            ) : (
              video.channel.name
            )}
            {[video.published, video.publishedRelative].filter(Boolean).join(" · ") &&
              ` · ${[video.published, video.publishedRelative].filter(Boolean).join(" · ")}`}
            {video.category ? ` · ${video.category}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Stat Icon={Eye} value={video.viewText ?? (video.viewCount !== undefined ? `${video.viewCount.toLocaleString()} views` : "—")} label="Views" />
        <Stat Icon={ThumbsUp} value={video.likeCount !== undefined ? formatCount(video.likeCount) : "—"} label="Likes" />
        <Stat Icon={MessageSquare} value={video.commentCount !== undefined ? formatCount(video.commentCount) : "—"} label="Comments" />
        {video.qualities?.length ? (
          <span className="flex items-center gap-1 text-caption text-ink-muted">
            <Captions size={11} />
            {video.qualities.slice(0, 6).join(" · ")}
          </span>
        ) : null}
      </div>
      {video.tags?.length ? (
        <p className="flex flex-wrap gap-1">
          {video.tags.slice(0, 12).map((t) => (
            <span key={t} className="rounded-md bg-surface-raised px-1.5 py-0.5 text-caption text-ink-muted">
              {t}
            </span>
          ))}
        </p>
      ) : null}
      {about && (
        <div className="border-t border-border pt-2">
          <p className={clsx("whitespace-pre-line text-caption leading-relaxed text-ink", clipped && "line-clamp-4")}>
            {about}
          </p>
          {about.length > 400 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-caption font-medium text-citation hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- comments ---

export interface YouTubeComment {
  author: string;
  authorUrl?: string;
  authorAvatar?: string;
  text: string;
  likes?: string;
  likeCount?: number;
  published?: string;
  replyCount?: number;
}

function AuthorAvatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-7 shrink-0 rounded-full ring-1 ring-border"
      />
    );
  }
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-caption font-semibold text-ink">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function YouTubeComments({
  comments,
  brand,
  totalText,
  hasMore,
  note,
}: {
  comments: YouTubeComment[];
  brand?: YouTubeBrand;
  totalText?: string;
  hasMore?: boolean;
  note?: string;
}) {
  if (!comments.length) {
    return (
      <p className="text-caption text-ink-muted">
        {note ?? "No comments on this page. They may be disabled."}
      </p>
    );
  }
  return (
    <div className="space-y-2" style={accentStyle(brand)}>
      <ul className="space-y-2">
        {comments.map((c, i) => (
          <li key={`${c.author}-${i}`} className="flex gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
            <AuthorAvatar name={c.author} src={c.authorAvatar} />
            <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              {c.authorUrl ? (
                <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" className="text-caption font-medium text-citation hover:underline">
                  {c.author}
                </a>
              ) : (
                <span className="text-caption font-medium text-ink">{c.author}</span>
              )}
              {c.published && <span className="text-caption text-ink-muted">{c.published}</span>}
              <span className="ml-auto flex items-center gap-1 text-caption tabular-nums text-ink-muted">
                <ThumbsUp size={9} />
                {c.likes ?? (c.likeCount !== undefined ? formatCount(c.likeCount) : "")}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-line text-caption leading-relaxed text-ink">{c.text}</p>
            {c.replyCount ? (
              <p className="mt-1 text-caption text-ink-muted">{c.replyCount} {c.replyCount === 1 ? "reply" : "replies"} — replies out of scope</p>
            ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-muted">
        {comments.length} shown{totalText ? ` · ${totalText}` : ""}
        {hasMore ? " · more available" : ""} · top-level only · {brand?.host ?? "youtube.com"}
      </p>
    </div>
  );
}

// --- transcript ---

export interface YouTubeCaptionTrack {
  code: string;
  name: string;
  auto?: boolean;
}

export interface YouTubeSegment {
  start: number;
  duration: number;
  text: string;
}

export function YouTubeTranscript({
  languages,
  picked,
  segments,
  text,
  brand,
  note,
  title,
  url,
  durationText,
  wordCount,
}: {
  languages: YouTubeCaptionTrack[];
  picked?: YouTubeCaptionTrack;
  segments?: YouTubeSegment[];
  text?: string;
  brand?: YouTubeBrand;
  note?: string;
  title?: string;
  url?: string;
  durationText?: string;
  wordCount?: number;
}) {
  const [showStamps, setShowStamps] = useState(true);
  if (!languages.length) {
    return <p className="text-caption text-ink-muted">This video publishes no captions.</p>;
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-2.5" style={accentStyle(brand)}>
      {title && (
        <div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-footnote font-medium leading-snug text-ink hover:underline"
            >
              {title}
            </a>
          ) : (
            <p className="text-footnote font-medium leading-snug text-ink">{title}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {durationText && <Stat Icon={Clock} value={durationText} label="Video duration" />}
            {wordCount !== undefined && (
              <Stat Icon={FileText} value={`${wordCount.toLocaleString("en-US")} words`} label="Transcript words" />
            )}
          </div>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-1">
        <Captions size={11} className="text-ink-muted" />
        {languages.slice(0, 10).map((l) => (
          <span
            key={`${l.code}-${l.name}`}
            className={clsx(
              "rounded-md px-1.5 py-0.5 font-mono text-caption",
              picked?.code === l.code ? "bg-[color:var(--shop-accent)] text-white" : "bg-surface-raised text-ink-muted",
            )}
            title={l.auto ? "Auto-generated" : "Uploaded"}
          >
            {l.code}
            {l.auto ? " · auto" : ""}
          </span>
        ))}
        {languages.length > 10 && (
          <span className="text-caption text-ink-muted">+{languages.length - 10} more</span>
        )}
      </p>
      {picked && (
        <p className="text-caption text-ink-muted">
          Showing {picked.name} ({picked.code}){picked.auto ? " — auto-generated" : ""}
        </p>
      )}
      {segments?.length ? (
        <div>
          <button
            type="button"
            onClick={() => setShowStamps((v) => !v)}
            className="mb-1 text-caption font-medium text-citation hover:underline"
          >
            {showStamps ? "Hide timestamps" : "Show timestamps"}
          </button>
          <ol className="scroll-thin max-h-72 space-y-1 overflow-auto rounded-xl border border-border bg-surface-raised p-1.5">
            {segments.map((s, i) => (
              <li key={`${s.start}-${i}`} className="flex items-start gap-2 rounded-lg px-1.5 py-1">
                {showStamps && (
                  <span className="mt-px shrink-0 font-mono text-caption tabular-nums text-ink-muted">
                    {cueTime(s.start)}
                  </span>
                )}
                <span className="text-caption leading-relaxed text-ink">{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : text ? (
        <p className="scroll-thin max-h-72 overflow-auto rounded-xl border border-border bg-surface-raised p-2 text-caption leading-relaxed text-ink">
          {text}
        </p>
      ) : (
        <p className="text-caption text-ink-muted">{note ?? "No caption text returned."}</p>
      )}
      {note && (segments?.length || text) ? <p className="text-caption text-ink-muted">{note}</p> : null}
    </div>
  );
}

// --- video clips (chat citations) ---

export interface ParsedClipUrl {
  videoId: string;
  start: number;
  end?: number;
}

function parseClipInt(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Matches youtu.be/{id}?t={s}[&end={e}] and youtube.com/watch?v={id}[&t={s}][&end={e}]. */
export function parseClipUrl(href: string): ParsedClipUrl | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = url.pathname.slice(1).split("/")[0] || null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname !== "/watch") return null;
    videoId = url.searchParams.get("v");
  } else {
    return null;
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const start = parseClipInt(url.searchParams.get("t"));
  if (start === undefined) return null;
  const end = parseClipInt(url.searchParams.get("end"));
  if (end !== undefined && end <= start) return null;
  return { videoId, start, end };
}

const ClipPlayerContext = createContext<{
  open: string | null;
  setOpen: (key: string | null) => void;
}>({ open: null, setOpen: () => {} });

export function ClipPlayerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return <ClipPlayerContext.Provider value={{ open, setOpen }}>{children}</ClipPlayerContext.Provider>;
}

export function YouTubeClip({
  clip,
  title,
  children,
}: {
  clip: ParsedClipUrl;
  title?: string;
  children?: ReactNode;
}) {
  const { open, setOpen } = useContext(ClipPlayerContext);
  const key = `${clip.videoId}:${clip.start}:${clip.end ?? ""}`;
  const isOpen = open === key;
  const range = clip.end !== undefined ? `${cueTime(clip.start)}-${cueTime(clip.end)}` : cueTime(clip.start);
  const embedSrc =
    `https://www.youtube-nocookie.com/embed/${clip.videoId}?start=${clip.start}` +
    `${clip.end !== undefined ? `&end=${clip.end}` : ""}&autoplay=1&rel=0`;
  return (
    <span style={accentStyle(YOUTUBE_BRAND)}>
      <button
        type="button"
        onClick={() => setOpen(isOpen ? null : key)}
        title={title || undefined}
        className={clsx(
          "rounded-md px-1.5 py-0.5 font-mono text-caption",
          isOpen ? "bg-[color:var(--shop-accent)] text-white" : "bg-surface-raised text-ink-muted hover:text-ink",
        )}
      >
        {children ?? `▶ ${range}`}
      </button>
      {isOpen && (
        <span className="mt-1.5 block overflow-hidden rounded-xl border border-border bg-black">
          <iframe
            key={key}
            src={embedSrc}
            title={`Video clip ${range}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full"
          />
          <span className="flex items-center justify-between gap-2 bg-surface-raised px-2 py-1">
            {title ? (
              <span className="truncate text-caption text-ink-muted" title={title}>
                {title}
              </span>
            ) : (
              <span />
            )}
            <a
              href={`https://youtu.be/${clip.videoId}?t=${clip.start}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-caption font-medium text-citation hover:underline"
            >
              Open on YouTube
            </a>
          </span>
        </span>
      )}
    </span>
  );
}
