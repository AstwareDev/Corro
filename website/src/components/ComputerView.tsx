"use client";

import { ArrowLeft, ArrowRight, Monitor, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { browserLiveWsUrl } from "@/lib/api";

interface ScreencastMetadata {
  deviceWidth: number;
  deviceHeight: number;
}

const control =
  "inline-flex items-center gap-1.5 rounded-row px-2.5 py-1.5 text-caption text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40";

export function ComputerView({
  open,
  sessionId,
  onClose,
}: {
  open: boolean;
  sessionId?: string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sizeRef = useRef({ width: 1280, height: 800 });

  const [status, setStatus] = useState<"connecting" | "live" | "error">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ url: string; title: string }>({
    url: "",
    title: "",
  });

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setStatus("connecting");
    setError(null);

    const socket = new WebSocket(browserLiveWsUrl(sessionId));
    socketRef.current = socket;

    socket.onopen = () => setStatus("live");
    socket.onerror = () => setStatus("error");
    socket.onclose = () => {
      socketRef.current = null;
    };
    socket.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "frame") {
        const canvas = canvasRef.current;
        const metadata = msg.metadata as ScreencastMetadata | undefined;
        if (canvas && metadata) {
          if (
            metadata.deviceWidth !== sizeRef.current.width ||
            metadata.deviceHeight !== sizeRef.current.height
          ) {
            sizeRef.current = {
              width: metadata.deviceWidth,
              height: metadata.deviceHeight,
            };
            canvas.width = metadata.deviceWidth;
            canvas.height = metadata.deviceHeight;
          }
          const ctx = canvas.getContext("2d");
          const img = new Image();
          img.onload = () => {
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = `data:image/jpeg;base64,${msg.data}`;
        }
      } else if (msg.type === "nav") {
        setPageInfo({
          url: String(msg.url ?? ""),
          title: String(msg.title ?? ""),
        });
      } else if (msg.type === "error") {
        setError(String(msg.error ?? "Something went wrong"));
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [open, sessionId]);

  function send(payload: unknown) {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="computer-view-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto h-[min(80dvh,760px)] w-[min(92vw,1100px)] max-w-none overflow-hidden rounded-popover border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Monitor size={18} className="shrink-0 text-ink-muted" />
          <h2
            id="computer-view-title"
            className="shrink-0 text-callout font-medium"
          >
            Corro&rsquo;s Computer
          </h2>
          <div className="mx-2 flex items-center gap-1">
            <button
              type="button"
              className={control}
              onClick={() => send({ type: "nav-action", action: "back" })}
              aria-label="Back"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              className={control}
              onClick={() => send({ type: "nav-action", action: "forward" })}
              aria-label="Forward"
            >
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className={control}
              onClick={() => send({ type: "nav-action", action: "reload" })}
              aria-label="Reload"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="min-w-0 flex-1 truncate rounded-row bg-surface-raised px-3 py-1.5 text-caption text-ink-muted">
            {pageInfo.url ||
              (status === "connecting" ? "Connecting…" : "No page")}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Corro's Computer"
            className={control}
          >
            <X size={17} />
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="border-b border-border px-4 py-2 text-caption text-contradicted"
          >
            {error}
          </div>
        )}

        <div className="relative flex flex-1 items-center justify-center overflow-auto bg-hairline">
          <canvas
            ref={canvasRef}
            width={sizeRef.current.width}
            height={sizeRef.current.height}
            className="max-h-full max-w-full bg-surface shadow-lg"
          />
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
