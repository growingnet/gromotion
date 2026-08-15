import { useEffect, useState } from "react";

const STATUS_LABELS = {
  copied: "Copied",
  error: "Copy failed",
} as const;

type Status = "idle" | keyof typeof STATUS_LABELS;

type CopyButtonProps = {
  /** Handed to the clipboard verbatim. */
  text: string;
  /** Button face while idle. The two outcome labels are fixed. */
  label?: string;
  /**
   * Names the thing being copied, for screen readers - "BibTeX for <title>".
   * Worth passing wherever several of these sit on one page, since "Copy" on
   * its own tells a screen reader nothing about which one it landed on.
   */
  describes?: string;
};

/**
 * Puts a string on the clipboard, then says so for a moment.
 *
 * The confirmation is usually the only feedback there is - nothing else on the
 * page changes when a copy succeeds - so it is announced via aria-live rather
 * than left as a colour and label swap only sighted users notice. The
 * accessible name stays fixed on the action while that live region carries the
 * outcome, so the button does not rename itself mid-interaction.
 */
export function CopyButton({ text, label = "Copy", describes }: CopyButtonProps) {
  const [status, setStatus] = useState<Status>("idle");

  // Clearing on unmount matters less here than the rule it keeps: no setState
  // firing from a timer after the button has gone.
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={describes ? `${label} for ${describes}` : label}
      className="shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors hover:bg-[var(--color-surface-2)]"
      style={{
        borderColor: status === "copied" ? "var(--color-grown)" : "var(--color-border)",
        color: status === "copied" ? "var(--color-grown)" : "var(--color-ink-2)",
      }}
    >
      <span aria-live="polite">{status === "idle" ? label : STATUS_LABELS[status]}</span>
    </button>
  );
}
