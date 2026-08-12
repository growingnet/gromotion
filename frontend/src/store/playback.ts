import { useEffect, useRef } from "react";
import { create } from "zustand";

/**
 * Playback is driven by a single float cursor over the growth-step axis.
 *
 * Keeping it fractional matters: the DAG is a step function (it can only change
 * at integer growth steps) but the training curves are continuous within a
 * step. Rendering the graph at `floor(position)` while revealing curves at the
 * exact fractional position keeps the two panels honest about each other.
 */
export interface PlaybackState {
  /** Fractional position on the growth-step axis. */
  position: number;
  maxStep: number;
  playing: boolean;
  /** Playback rate as a multiplier of 1x; see `STEPS_PER_SECOND_AT_1X`. */
  speed: number;

  setPosition: (value: number) => void;
  setMaxStep: (value: number) => void;
  setSpeed: (value: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepBy: (delta: number) => void;
  restart: () => void;
}

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * Growth steps per second at 1x.
 *
 * `speed` is the number on the button, not a rate: the transport reads "1x" as
 * the run's natural pace, and the pace itself is set here. Keeping the two
 * apart means retuning how fast playback feels never touches the labels.
 */
const STEPS_PER_SECOND_AT_1X = 0.5;

export const usePlayback = create<PlaybackState>((set, get) => ({
  position: 0,
  maxStep: 0,
  playing: false,
  speed: 1.5,

  setPosition: (value) => set({ position: clamp(value, 0, get().maxStep) }),
  setMaxStep: (value) =>
    set({ maxStep: Math.max(0, value), position: clamp(get().position, 0, value) }),
  setSpeed: (value) => set({ speed: clamp(value, 0.25, 12) }),
  play: () => {
    // Replaying from the end should start over rather than sit still.
    const { position, maxStep } = get();
    set({ playing: true, position: position >= maxStep ? 0 : position });
  },
  pause: () => set({ playing: false }),
  toggle: () => (get().playing ? get().pause() : get().play()),
  stepBy: (delta) =>
    set({ playing: false, position: clamp(Math.round(get().position) + delta, 0, get().maxStep) }),
  restart: () => set({ position: 0, playing: true }),
}));

/**
 * Advances the cursor while playing. Uses delta time rather than a fixed
 * per-frame increment so playback speed is independent of display refresh rate.
 */
export function usePlaybackClock() {
  const frame = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  useEffect(() => {
    const tick = (now: number) => {
      const { playing, speed, position, maxStep, setPosition, pause } =
        usePlayback.getState();

      if (playing) {
        const previous = lastTime.current ?? now;
        const deltaSeconds = Math.min((now - previous) / 1000, 0.25);
        const next = position + deltaSeconds * speed * STEPS_PER_SECOND_AT_1X;
        if (next >= maxStep) {
          setPosition(maxStep);
          pause();
        } else {
          setPosition(next);
        }
      }
      lastTime.current = now;
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      lastTime.current = null;
    };
  }, []);
}

/** Keyboard transport: space toggles, arrows step. */
export function usePlaybackKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const { toggle, stepBy } = usePlayback.getState();
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        stepBy(1);
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        stepBy(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
