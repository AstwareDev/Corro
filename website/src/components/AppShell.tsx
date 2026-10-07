"use client";

import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAppearance } from "@/lib/appearance";
import { HistorySidebar } from "./HistorySidebar";

export function AppShell({
  activeSessionId,
  children,
}: {
  activeSessionId?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { layout } = useAppearance();
  const inset = layout !== "borderless";
  const [refreshKey, setRefreshKey] = useState(0);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setRefreshKey((n) => n + 1);
  });

  return (
    <div
      className={clsx(
        "relative flex h-dvh overflow-hidden",
        inset ? "gap-2 bg-canvas p-2" : "bg-surface",
      )}
    >
      <HistorySidebar
        activeId={activeSessionId ?? null}
        refreshKey={refreshKey}
        onSelect={(id) => router.push(`/chat/${id}`)}
        onNewChat={() => router.push("/")}
      />
      {children}
    </div>
  );
}
