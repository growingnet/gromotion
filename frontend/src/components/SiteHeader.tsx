import { href, type Route } from "../routes";

/**
 * One header for every page, so the brand and the nav do not drift apart.
 * `children` fills the right-hand side - the player puts its run selector there.
 *
 * `large` is for prose pages, which have room to be bold about it. The player
 * stays compact on purpose: it lays out in a fixed viewport, and every pixel
 * the header takes is a pixel off the DAG panels.
 */
export function SiteHeader({
  current,
  large = false,
  children,
}: {
  current: Route;
  large?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={`flex shrink-0 flex-wrap items-center justify-between gap-3 ${
        large ? "border-b pb-5" : ""
      }`}
      style={large ? { borderColor: "var(--color-border)" } : undefined}
    >
      <a
        href={href("landing")}
        className={`flex items-center ${large ? "gap-3" : "gap-2"}`}
        aria-label="GroMotion home"
      >
        <Mark size={large ? 52 : 34} />
        <span
          className={`font-bold tracking-tight ${large ? "text-3xl sm:text-4xl" : "text-lg"}`}
        >
          Gro<span style={{ color: "var(--color-grown)" }}>Motion</span>
        </span>
      </a>
      <div className={`flex flex-wrap items-center ${large ? "gap-4" : "gap-3"}`}>
        <a
          href={href(current === "player" ? "landing" : "player")}
          className={`font-medium hover:underline ${large ? "text-base" : "text-sm"}`}
          style={{ color: "var(--color-ink-2)" }}
        >
          {current === "player" ? "about" : "open the player →"}
        </a>
        {children}
      </div>
    </header>
  );
}

/** The GroMotion mark: a small node growing into a larger one. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="2 9 30 14" width={size} height={(size * 14) / 30} aria-hidden="true">
      <path
        d="M8 16 H16 M16 16 H23"
        stroke="var(--color-idle)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      <circle cx="6" cy="16" r="3" fill="var(--color-idle)" />
      <circle cx="16" cy="16" r="4.5" fill="var(--color-idle)" />
      <circle cx="25" cy="16" r="6" fill="var(--color-grown)" />
    </svg>
  );
}
