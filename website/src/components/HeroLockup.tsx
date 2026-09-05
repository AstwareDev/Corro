"use client";

import { useMotionPreference } from "@/lib/appearance";

import { motion, type Variants } from "framer-motion";

const RAYS: { d: string; rank: number }[] = [
  { d: "M500 60L500 940", rank: 0 },
  { d: "M948.4 60L500 940", rank: 3 },
  { d: "M51.6 60L500 940", rank: 3 },
  { d: "M596.6 537.5L500 940", rank: 2 },
  { d: "M403.4 537.5L500 940", rank: 2 },
  { d: "M692.9 714.1L500 940", rank: 1 },
  { d: "M307.1 714.1L500 940", rank: 1 },
];

const WORDMARK =
  "M664.6 127.6A369.5 369.5 0 1 0 664.6 572.4L577.1 506.5A260 260 0 1 1 577.1 193.5ZM748.9 350A369.5 369.5 0 1 1 1487.9 350A369.5 369.5 0 1 1 748.9 350ZM858.4 350A260 260 0 1 1 1378.4 350A260 260 0 1 1 858.4 350ZM1652.9 0L2032.1 0A175 175 0 0 1 2032.1 350L2000.9 350L2245.9 700L2112.2 700L1867.2 350L1762.4 350L1762.4 700L1652.9 700ZM1762.4 109.5L2032.1 109.5A65.5 65.5 0 0 1 2032.1 240.5L1762.4 240.5ZM2410.9 0L2790.1 0A175 175 0 0 1 2790.1 350L2758.9 350L3003.9 700L2870.2 700L2625.2 350L2520.4 350L2520.4 700L2410.9 700ZM2520.4 109.5L2790.1 109.5A65.5 65.5 0 0 1 2790.1 240.5L2520.4 240.5ZM3110.9 350A369.5 369.5 0 1 1 3849.9 350A369.5 369.5 0 1 1 3110.9 350ZM3220.4 350A260 260 0 1 1 3740.4 350A260 260 0 1 1 3220.4 350Z";

const EASE = [0.16, 1, 0.3, 1] as const;

const rayVariants: Variants = {
  hidden: { pathLength: 0, pathOffset: 1, opacity: 0 },
  visible: (rank: number) => ({
    pathLength: 1,
    pathOffset: 0,
    opacity: 1,
    transition: {
      delay: 0.06 * (3 - rank),
      duration: 0.55,
      ease: EASE,
      opacity: { duration: 0.12 },
    },
  }),
  exit: (rank: number) => ({
    pathLength: 0,
    pathOffset: 1,
    opacity: 0,
    transition: {
      delay: 0.05 * rank,
      duration: 0.32,
      ease: [0.7, 0, 0.84, 0] as const,
      opacity: { delay: 0.05 * rank + 0.24, duration: 0.08 },
    },
  }),
};

const wordmarkVariants: Variants = {
  hidden: { opacity: 0, x: -28 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { delay: 0.24, duration: 0.5, ease: EASE },
  },
  exit: {
    opacity: 0,
    x: -36,
    scale: 0.94,
    transition: { duration: 0.26, ease: [0.7, 0, 0.84, 0] as const },
  },
};

export function HeroLockup({ className }: { className?: string }) {
  const motionOff = useMotionPreference();
  const reduce = useMotionPreference();

  return (
    <motion.svg
      viewBox="-1724.1 -300 5574 1300"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Corro"
      className={className}
      initial={motionOff ? false : reduce ? false : "hidden"}
      animate="visible"
      exit={reduce ? { opacity: 0 } : "exit"}
      variants={reduce ? undefined : { hidden: {}, visible: {}, exit: {} }}
      transition={
        motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
      }
    >
      <title>Corro</title>
      <g transform="translate(-1771.8 -372.9) scale(1.43945)">
        {RAYS.map(({ d, rank }) => (
          <motion.path
            key={d}
            d={d}
            custom={rank}
            variants={reduce ? undefined : rayVariants}
            fill="none"
            stroke="currentColor"
            strokeWidth={42}
            strokeLinecap="round"
            transition={
              motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
            }
          />
        ))}
      </g>
      <motion.path
        d={WORDMARK}
        variants={reduce ? undefined : wordmarkVariants}
        style={{ transformBox: "fill-box", transformOrigin: "left center" }}
        transition={
          motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
        }
      />
    </motion.svg>
  );
}
