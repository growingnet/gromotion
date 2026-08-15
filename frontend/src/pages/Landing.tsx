import { CopyButton } from "../components/CopyButton";
import { SiteHeader } from "../components/SiteHeader";
import { PAPERS } from "../lib/papers";
import { href } from "../routes";

export function Landing() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-16 px-6 py-6 pb-24">
        <SiteHeader current="landing" large />

        <section className="flex flex-col items-center gap-6 pt-4 text-center">
          <HeroGraph />
          {/* "grow" outsizes the line it sits in, so the word does the thing it
              names. Both parts need leading-none: a line box grows to fit its
              tallest glyph, and any multiplier above 1 applied to the oversized
              span turns into dead space above and below the whole heading. The
              sizes are also capped so the phrase still fits the column on one
              line - at 6xl/8xl it overflowed and "grow." broke onto its own. */}
          <h1 className="text-4xl leading-none font-bold tracking-tight sm:text-5xl">
            Watch your network{" "}
            <span
              className="text-7xl leading-none sm:text-7xl"
              style={{ color: "var(--color-grown)" }}
            >
              grow
            </span>
            .
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[var(--color-ink-2)]">
            An interactive replay of <strong className="text-[var(--color-ink)]">gromo</strong>{" "}
            training runs. The architecture builds itself, step by step, alongside the
            curves it is trying to improve.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href={href("player")}
              className="rounded-lg px-6 py-3 text-base font-semibold transition-transform hover:scale-[1.03]"
              style={{ background: "var(--color-grown)", color: "#ffffff" }}
            >
              Watch a run →
            </a>
            <a
              href="https://github.com/growingnet/gromo"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border px-6 py-3 text-base font-medium"
              style={{ borderColor: "var(--color-border)" }}
            >
              gromo on GitHub
            </a>
          </div>
        </section>

        <Section title="Networks that grow">
          <p>
            Instead of fixing an architecture up front, <strong>gromo</strong> starts
            from a minimal network and adds capacity during training. At each{" "}
            <em>growth step</em> it measures where the model is held back by its own
            size - the <em>expressivity bottleneck</em> - and adds neurons exactly
            there.
          </p>
          <p>
            So the architecture is not a diagram. It is something that happens over
            time, which a static figure cannot show. That is what this site is for.
          </p>
        </Section>

        <Section title="What you are looking at">
          <p>
            Each panel is one growing sub-network: a directed graph from{" "}
            <Code>start</Code> to <Code>end</Code>. A node is a layer, and its disc
            scales with channel count; an edge is a convolution between layers. The
            training curves run alongside, revealed at the same moment.
          </p>
          <p>Colour is reserved almost entirely for growth events:</p>
          <div className="grid gap-3 pt-1 sm:grid-cols-3">
            <Card color="var(--color-grown)" label="new structure">
              A node or connection that did not exist a step ago.
            </Card>
            <Card color="var(--color-updated)" label="widened">
              An existing node gained channels. Same topology, more capacity.
            </Card>
            <Card color="var(--color-idle)" label="unchanged">
              Structure that is carried over untouched.
            </Card>
          </div>
          <p>
            Layout is computed once, on the union of every step, so a node appearing
            never shifts the ones already there - growth reads as growth rather than
            noise. Faint dashed rings mark space held open for structure that arrives
            later.
          </p>
        </Section>

        <Section title="Using it">
          <p>
            Scrub, pause, and change speed over the growth-step axis. <Kbd>space</Kbd>{" "}
            plays and pauses; <Kbd>←</Kbd> and <Kbd>→</Kbd> step one at a time.
          </p>
          <p>
            Set the chart x-axis to <strong>parameters</strong> to plot accuracy
            against model size rather than time - the view that shows whether growing
            reaches a given accuracy more cheaply. The URL tracks the run, step, and
            axis, so any frame can be linked straight from slides or a paper.
          </p>
        </Section>

        <Section title="Built on gromo">
          <p>
            GroMotion is a viewer. The growing itself is done by{" "}
            <Link href="https://github.com/growingnet/gromo">gromo</Link>, a
            growing-networks module for PyTorch, documented at{" "}
            <Link href="https://growingnet.github.io/gromo/">
              growingnet.github.io/gromo
            </Link>
            .
          </p>
          <p>
            gromo is released under the BSD 3-Clause License - Copyright 2025- Gromo
            developers. It permits redistribution in source and binary form, with or
            without modification, provided the copyright notice, the list of
            conditions, and the disclaimer are retained, and provided the names of the
            copyright holder and its contributors are not used to endorse derived
            products without prior written permission. The software is provided as is,
            with all warranties disclaimed. See the{" "}
            <Link href="https://github.com/growingnet/gromo/blob/main/LICENCE.md">
              full licence text
            </Link>
            .
          </p>
        </Section>

        <Section title="Papers - Cite us!">
          <p>The methods replayed here are described in:</p>
          <ol className="flex flex-col gap-5 pt-1">
            {PAPERS.map((paper) => (
              <li key={paper.title} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <Link href={paper.url}>
                    <span className="text-[var(--color-ink)]">{paper.title}</span>
                  </Link>
                  <CopyButton
                    text={paper.bibtex}
                    label="Copy BibTeX"
                    describes={paper.title}
                  />
                </div>
                <span>
                  {paper.authors} ({paper.year}). <em>{paper.venue}</em>.
                </span>
                {/* <span>
                  <Link href={paper.arxiv}>arXiv</Link>
                </span> */}
              </li>
            ))}
          </ol>
        </Section>

        <section
          className="flex flex-col items-start gap-4 rounded-xl border p-8"
          style={{
            background: "var(--color-surface-2)",
            borderColor: "var(--color-border)",
          }}
        >
          <h2 className="text-2xl font-semibold tracking-tight">
            Read the Growing Wiki
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-ink-2)]">
            Growing networks is a field, not one library. The Growing Wiki collects
            the theory, the design principles, the applications, and a taxonomy of
            the algorithms - the wider context for everything replayed here.
          </p>
          <a
            href="https://growingnet.github.io/growing_wiki/"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-6 py-3 text-base font-semibold transition-transform hover:scale-[1.03]"
            style={{ background: "var(--color-grown)", color: "#ffffff" }}
          >
            Open the wiki →
          </a>
        </section>

        <footer
          className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-6 text-sm text-[var(--color-ink-2)]"
          style={{ borderColor: "var(--color-border)" }}
        >
          <a href={href("player")} className="hover:underline">
            Player
          </a>
          <Link href="https://growingnet.github.io/growing_wiki/">Growing Wiki</Link>
          <Link href="https://github.com/growingnet/gromo">gromo</Link>
          <Link href="https://github.com/growingnet/gromotion">Source</Link>
        </footer>
      </div>
    </div>
  );
}

/**
 * A run in miniature: start and end exist from the outset, joined by one direct
 * edge, and hidden nodes are added between them on a loop.
 *
 * Nodes are the single source of truth for position and every edge is drawn
 * centre-to-centre between two of them, then painted over by the opaque discs.
 * Hand-written endpoints are what let an edge drift away from the node it was
 * meant to touch, so there are none here.
 */
const HERO_NODES = {
  start: { x: 26, y: 48, r: 12, color: "var(--color-idle)", delay: 0 },
  top: { x: 128, y: 24, r: 14, color: "var(--color-grown)", delay: 1.1 },
  bottom: { x: 128, y: 72, r: 11, color: "var(--color-grown)", delay: 2.4 },
  end: { x: 232, y: 48, r: 17, color: "var(--color-idle)", delay: 0.2 },
} as const;

type HeroNode = keyof typeof HERO_NODES;

// [from, to, delay] - each edge follows the node it depends on.
const HERO_EDGES: [HeroNode, HeroNode, number][] = [
  ["start", "end", 0.5],
  ["start", "top", 1.4],
  ["top", "end", 1.6],
  ["start", "bottom", 2.7],
  ["bottom", "end", 2.9],
];

function HeroGraph() {
  return (
    <svg viewBox="0 0 258 96" className="w-full max-w-md" aria-hidden="true">
      {HERO_EDGES.map(([from, to, delay]) => {
        const a = HERO_NODES[from];
        const b = HERO_NODES[to];
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--color-idle)"
            strokeWidth={3}
            strokeLinecap="round"
            className="hero-edge"
            style={{ animationDelay: `${delay}s` }}
          />
        );
      })}

      {Object.entries(HERO_NODES).map(([name, node]) => (
        <circle
          key={name}
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill={node.color}
          className="hero-grow"
          style={{ animationDelay: `${node.delay}s` }}
        />
      ))}
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-4 text-base leading-relaxed text-[var(--color-ink-2)]">
        {children}
      </div>
    </section>
  );
}

function Card({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border p-4 text-sm"
      style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
    >
      <span className="flex items-center gap-2 font-semibold text-[var(--color-ink)]">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Link({ href: url, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="underline hover:no-underline">
      {children}
    </a>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded px-1 py-0.5 text-[0.9em]"
      style={{ background: "var(--color-surface-2)" }}
    >
      {children}
    </code>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="rounded border px-1.5 py-0.5 text-[0.85em] font-medium text-[var(--color-ink)]"
      style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
    >
      {children}
    </kbd>
  );
}
