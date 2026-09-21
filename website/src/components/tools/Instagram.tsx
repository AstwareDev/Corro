"use client";

import clsx from "clsx";
import {
  BadgeCheck,
  Clapperboard,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Layers,
  Lock,
  MessageCircle,
  Video,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { formatCount } from "./YouTube";

export interface InstagramBrand {
  name: string;
  host: string;
  accent: string;
}

export const INSTAGRAM_BRAND: InstagramBrand = {
  name: "Instagram",
  host: "instagram.com",
  accent: "#ee2a7b",
};

function accentStyle(brand?: InstagramBrand): CSSProperties {
  return {
    "--shop-accent": brand?.accent ?? "var(--corro-text)",
  } as CSSProperties;
}

export function formatPostDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- shared bits ---

function MediaThumb({
  src,
  alt,
  type,
  corner,
  className,
}: {
  src?: string;
  alt: string;
  type?: string;
  corner?: string;
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
        <span className="flex flex-col items-center gap-1 text-white/60">
          <ImageIcon size={16} />
          <span className="text-caption">No preview</span>
        </span>
      )}
      {type && (
        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-px text-caption font-semibold uppercase tracking-wide text-white">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
      )}
      {corner && (
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px font-mono text-caption tabular-nums text-white">
          {corner}
        </span>
      )}
    </div>
  );
}

function TypeChip({ type }: { type: string }) {
  const Icon =
    type === "reel"
      ? Clapperboard
      : type === "video"
        ? Video
        : type === "carousel"
          ? Layers
          : ImageIcon;
  const label =
    type === "reel"
      ? "Reel"
      : type === "video"
        ? "Video"
        : type === "carousel"
          ? "Album"
          : "Photo";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-1.5 py-0.5 text-caption font-medium text-ink-muted"
      title={`Media type: ${label}`}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

function CountStat({
  Icon,
  value,
  label,
}: {
  Icon: typeof Heart;
  value: string;
  label: string;
}) {
  return (
    <span
      className="flex items-center gap-1 text-caption tabular-nums text-ink-muted"
      title={label}
    >
      <Icon size={11} />
      {value}
    </span>
  );
}

function NoteLine({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p className="rounded-lg bg-surface-raised px-2.5 py-1.5 text-caption leading-relaxed text-ink-muted">
      {note}
    </p>
  );
}

function SourceLine({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-ink-muted">{children}</p>;
}

// --- types mirroring the scraper output ---

export interface InstagramPost {
  id: string;
  shortcode: string;
  caption?: string;
  type: "image" | "video" | "carousel" | "reel";
  likes?: string;
  likeCount?: number;
  comments?: string;
  commentCount?: number;
  timestamp?: string;
  takenAt?: number;
  url: string;
  mediaUrls: string[];
  playCount?: number;
  ownerUsername?: string;
}

export interface InstagramProfile {
  username: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  followerText?: string;
  following?: number;
  postCount?: number;
  avatar?: string;
  verified: boolean;
  private: boolean;
  url: string;
  posts?: InstagramPost[];
}

export interface InstagramComment {
  username: string;
  text: string;
  likes?: string;
  likeCount?: number;
  timestamp?: string;
  takenAt?: number;
}

// --- profile ---

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="text-footnote font-semibold tabular-nums text-ink">
        {value}
      </span>
      <span className="text-caption text-ink-muted">{label}</span>
    </span>
  );
}

export function InstagramProfileCard({
  profile,
  note,
  brand,
}: {
  profile: InstagramProfile;
  note?: string;
  brand?: InstagramBrand;
}) {
  const [expanded, setExpanded] = useState(false);
  const bio = profile.bio ?? "";
  const clipped = bio.length > 160 && !expanded;
  const preview = (profile.posts ?? []).slice(0, 6);
  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-surface p-2.5"
      style={accentStyle(brand)}
    >
      <div className="flex gap-3">
        {profile.avatar ? (
          <img
            src={profile.avatar}
            alt={profile.displayName ?? profile.username}
            loading="lazy"
            className="size-16 shrink-0 rounded-full object-cover ring-2 ring-[color:var(--shop-accent)] ring-offset-2 ring-offset-surface"
          />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-raised text-display font-semibold text-ink">
            {profile.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-footnote font-medium leading-snug text-ink hover:underline"
            >
              {profile.displayName ?? profile.username}
            </a>
            {profile.verified && (
              <span
                title="Verified account"
                className="text-[color:var(--shop-accent)]"
              >
                <BadgeCheck size={14} />
              </span>
            )}
            {profile.private && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-1.5 py-0.5 text-caption font-medium text-ink-muted">
                <Lock size={9} />
                Private
              </span>
            )}
          </p>
          <p className="mt-0.5 text-caption text-ink-muted">
            @{profile.username}
          </p>
          <div className="mt-1.5 flex gap-4">
            <StatCell
              value={
                profile.postCount !== undefined
                  ? formatCount(profile.postCount)
                  : "—"
              }
              label="posts"
            />
            <StatCell
              value={
                profile.followerText ??
                (profile.followers !== undefined
                  ? formatCount(profile.followers)
                  : "—")
              }
              label="followers"
            />
            <StatCell
              value={
                profile.following !== undefined
                  ? formatCount(profile.following)
                  : "—"
              }
              label="following"
            />
          </div>
        </div>
      </div>
      {bio && (
        <div>
          <p
            className={clsx(
              "whitespace-pre-line text-caption leading-relaxed text-ink",
              clipped && "line-clamp-3",
            )}
          >
            {bio}
          </p>
          {bio.length > 160 && (
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
      {preview.length > 0 && (
        <div>
          <p className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-muted">
            Recent posts
          </p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {preview.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                title={p.caption ? p.caption.slice(0, 120) : p.shortcode}
              >
                <MediaThumb
                  src={p.mediaUrls[0]}
                  alt={p.caption ?? `Post by @${profile.username}`}
                  type={p.type === "image" ? undefined : p.type}
                  className="aspect-square w-full"
                />
              </a>
            ))}
          </div>
        </div>
      )}
      <NoteLine note={note} />
      <SourceLine>
        <a
          href={profile.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          Open on Instagram <ExternalLink size={9} />
        </a>
        {" · "}
        {brand?.host ?? "instagram.com"}
      </SourceLine>
    </div>
  );
}

// --- post grid ---

function PostCard({ post }: { post: InstagramPost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-2 transition-colors hover:bg-surface-raised"
    >
      <MediaThumb
        src={post.mediaUrls[0]}
        alt={post.caption ?? `Instagram ${post.type}`}
        type={post.type === "image" ? undefined : post.type}
        corner={
          post.type === "carousel" && post.mediaUrls.length > 1
            ? `1/${post.mediaUrls.length}`
            : post.type === "reel" && post.playCount !== undefined
              ? formatCount(post.playCount)
              : undefined
        }
        className="aspect-square w-full"
      />
      {post.caption && (
        <span className="line-clamp-2 text-caption leading-snug text-ink group-hover:underline">
          {post.caption}
        </span>
      )}
      <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        <CountStat
          Icon={Heart}
          value={
            post.likes ??
            (post.likeCount !== undefined ? formatCount(post.likeCount) : "—")
          }
          label="Likes"
        />
        <CountStat
          Icon={MessageCircle}
          value={
            post.comments ??
            (post.commentCount !== undefined
              ? formatCount(post.commentCount)
              : "—")
          }
          label="Comments"
        />
        {formatPostDate(post.timestamp) && (
          <span className="text-caption text-ink-muted">
            {formatPostDate(post.timestamp)}
          </span>
        )}
      </span>
    </a>
  );
}

export function InstagramPostGrid({
  posts,
  brand,
  kind,
  hasMore,
  note,
  emptyText,
}: {
  posts: InstagramPost[];
  brand?: InstagramBrand;
  kind?: string;
  hasMore?: boolean;
  note?: string;
  emptyText?: string;
}) {
  if (!posts.length) {
    return (
      <div className="space-y-2">
        <p className="text-caption text-ink-muted">
          {emptyText ??
            "No posts on this page. The grid may need a session Instagram trusts."}
        </p>
        <NoteLine note={note} />
      </div>
    );
  }
  return (
    <div className="space-y-2" style={accentStyle(brand)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
      <NoteLine note={note} />
      <SourceLine>
        {posts.length} {kind === "reels" ? "reel" : "post"}
        {posts.length === 1 ? "" : "s"}
        {hasMore ? " · more available" : ""} · {brand?.host ?? "instagram.com"}
      </SourceLine>
    </div>
  );
}

// --- post detail ---

export function InstagramPostDetail({
  post,
  brand,
  note,
}: {
  post: InstagramPost;
  brand?: InstagramBrand;
  note?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState(0);
  const caption = post.caption ?? "";
  const clipped = caption.length > 300 && !expanded;
  const media = post.mediaUrls.length ? post.mediaUrls : [];
  const current = media[Math.min(picked, media.length - 1)];
  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-surface p-2.5"
      style={accentStyle(brand)}
    >
      {current ? (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <MediaThumb
            src={current}
            alt={caption || `Instagram ${post.type}`}
            type={post.type === "image" ? undefined : post.type}
            corner={
              media.length > 1
                ? `${Math.min(picked, media.length - 1) + 1}/${media.length}`
                : undefined
            }
            className="aspect-square w-full"
          />
        </a>
      ) : null}
      {media.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {media.map((src, i) => (
            <button
              key={`${src.slice(-24)}-${i}`}
              type="button"
              onClick={() => setPicked(i)}
              className={clsx(
                "shrink-0 rounded-lg ring-2 transition",
                i === Math.min(picked, media.length - 1)
                  ? "ring-[color:var(--shop-accent)]"
                  : "opacity-60 ring-transparent hover:opacity-100",
              )}
              title={`Photo ${i + 1}`}
            >
              <MediaThumb src={src} alt="" className="size-14" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <TypeChip type={post.type} />
        {post.type === "reel" && post.playCount !== undefined && (
          <span className="text-caption tabular-nums text-ink-muted">
            {formatCount(post.playCount)} plays
          </span>
        )}
        {post.ownerUsername && (
          <a
            href={`https://www.instagram.com/${post.ownerUsername}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-caption text-citation hover:underline"
          >
            @{post.ownerUsername}
          </a>
        )}
        {formatPostDate(post.timestamp) && (
          <span className="text-caption text-ink-muted">
            · {formatPostDate(post.timestamp)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <CountStat
          Icon={Heart}
          value={
            post.likes ??
            (post.likeCount !== undefined ? formatCount(post.likeCount) : "—")
          }
          label="Likes"
        />
        <CountStat
          Icon={MessageCircle}
          value={
            post.comments ??
            (post.commentCount !== undefined
              ? formatCount(post.commentCount)
              : "—")
          }
          label="Comments"
        />
      </div>
      {caption && (
        <div>
          <p
            className={clsx(
              "whitespace-pre-line text-caption leading-relaxed text-ink",
              clipped && "line-clamp-4",
            )}
          >
            {caption}
          </p>
          {caption.length > 300 && (
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
      <NoteLine note={note} />
      <SourceLine>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          Open on Instagram <ExternalLink size={9} />
        </a>
        {" · "}
        {brand?.host ?? "instagram.com"}
      </SourceLine>
    </div>
  );
}

// --- comments ---

export function InstagramComments({
  comments,
  brand,
  hasMore,
  note,
  disabled,
}: {
  comments: InstagramComment[];
  brand?: InstagramBrand;
  hasMore?: boolean;
  note?: string;
  disabled?: boolean;
}) {
  if (!comments.length) {
    return (
      <div className="space-y-2">
        <p className="text-caption text-ink-muted">
          {note ??
            (disabled
              ? "Comments are disabled on this post."
              : "No comments yet on this post.")}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2" style={accentStyle(brand)}>
      <ul className="space-y-2">
        {comments.map((c, i) => (
          <li
            key={`${c.username}-${i}`}
            className="rounded-xl border border-border bg-surface px-2.5 py-2"
          >
            <p className="text-caption leading-relaxed text-ink">
              <span className="font-medium">{c.username}</span>{" "}
              <span className="whitespace-pre-line">{c.text}</span>
            </p>
            <p className="mt-1 flex items-center gap-2.5 text-caption tabular-nums text-ink-muted">
              {formatPostDate(c.timestamp) && (
                <span>{formatPostDate(c.timestamp)}</span>
              )}
              {(c.likes ??
                (c.likeCount !== undefined ? formatCount(c.likeCount) : "")) !==
                "" && (
                <span className="inline-flex items-center gap-1">
                  <Heart size={9} />
                  {c.likes ?? formatCount(c.likeCount)}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
      <NoteLine note={note} />
      <SourceLine>
        {comments.length} shown{hasMore ? " · more available" : ""} · top-level
        only · {brand?.host ?? "instagram.com"}
      </SourceLine>
    </div>
  );
}
