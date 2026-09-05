"use client";

import { useMotionPreference } from "@/lib/appearance";

import clsx from "clsx";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { synthesiseSpeech } from "@/lib/api";

type State = "idle" | "loading" | "playing" | "error";

export function SpeakButton({ text }: { text: string }) {
  const motionOff = useMotionPreference();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function stop() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setState("idle");
  }

  async function play() {
    if (state === "playing") {
      stop();
      return;
    }
    if (state === "loading") {
      abortRef.current?.abort();
      setState("idle");
      return;
    }

    setError(null);

    try {
      if (!urlRef.current) {
        setState("loading");
        const controller = new AbortController();
        abortRef.current = controller;
        const blob = await synthesiseSpeech(text, controller.signal);
        urlRef.current = URL.createObjectURL(blob);
      }

      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = urlRef.current;
      audio.onended = () => setState("idle");
      audio.onerror = () => {
        setError("Could not play the audio");
        setState("error");
      };
      await audio.play();
      setState("playing");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setState("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Speech failed");
      setState("error");
    }
  }

  const Icon =
    state === "loading"
      ? Loader2
      : state === "playing"
        ? Square
        : state === "error"
          ? AlertTriangle
          : Volume2;

  return (
    <motion.button
      type="button"
      onClick={play}
      whileTap={motionOff ? undefined : { scale: 0.8 }}
      title={error ?? (state === "playing" ? "Stop" : "Read aloud")}
      className={clsx(
        "rounded-full p-1.5 transition-colors hover:bg-surface-raised hover:text-ink",
        state === "error" && "text-contradicted",
      )}
      transition={
        motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
      }
    >
      <Icon
        size={15}
        className={clsx(state === "loading" && "animate-spin")}
        {...(state === "playing" ? { fill: "currentColor" } : {})}
      />
    </motion.button>
  );
}
