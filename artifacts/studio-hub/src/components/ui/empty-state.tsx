import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type CTA = {
  label: string;
} & (
  | { onClick: () => void; href?: never }
  | { href: string; onClick?: never }
);

type Tone = "purple" | "teal" | "amber" | "rose" | "violet" | "cream";

interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  subline?: string;
  cta?: CTA;
  secondary?: CTA;
  tone?: Tone;
  className?: string;
}

const TONES: Record<Tone, { ring: string; icon: string; ringColor: string }> = {
  purple: { ring: "bg-[#7250ef]/10", icon: "text-[#7250ef]", ringColor: "#7250ef" },
  teal:   { ring: "bg-[#00b199]/10", icon: "text-[#00b199]", ringColor: "#00b199" },
  amber:  { ring: "bg-amber-500/10", icon: "text-amber-400",  ringColor: "#fbbf24" },
  rose:   { ring: "bg-rose-500/10",  icon: "text-rose-400",   ringColor: "#fb7185" },
  violet: { ring: "bg-violet-500/10",icon: "text-violet-400", ringColor: "#a78bfa" },
  cream:  { ring: "bg-[#f0edea]/10", icon: "text-[#f0edea]",  ringColor: "#f0edea" },
};

export function EmptyState({
  icon: Icon,
  headline,
  subline,
  cta,
  secondary,
  tone = "purple",
  className,
}: EmptyStateProps) {
  const t = TONES[tone];

  return (
    <Empty
      className={cn(
        "relative overflow-hidden border-0 bg-transparent gap-5 py-14 md:py-16 px-6",
        className
      )}
    >
      {/* Orbital rings — decorative atmosphere, off-center for grid-breaking asymmetry */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 select-none opacity-[0.18]"
        width="340"
        height="340"
        viewBox="0 0 340 340"
        fill="none"
      >
        <circle cx="170" cy="170" r="40"  stroke={t.ringColor} strokeWidth="1" />
        <circle cx="170" cy="170" r="78"  stroke={t.ringColor} strokeWidth="1" strokeDasharray="2 4" />
        <circle cx="170" cy="170" r="120" stroke={t.ringColor} strokeWidth="1" opacity="0.6" />
        <circle cx="170" cy="170" r="165" stroke={t.ringColor} strokeWidth="1" strokeDasharray="1 6" opacity="0.4" />
      </svg>

      <EmptyHeader className="relative z-10 gap-3">
        <EmptyMedia
          variant="icon"
          className={cn("size-14 rounded-2xl shadow-lg shadow-black/20", t.ring, t.icon)}
        >
          <Icon className="size-7" />
        </EmptyMedia>
        <EmptyTitle
          className="font-display text-3xl md:text-4xl font-normal tracking-tight text-foreground"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 60, 'wght' 420" }}
        >
          {headline}
        </EmptyTitle>
        {subline && (
          <EmptyDescription className="max-w-md text-[15px] leading-relaxed">
            {subline}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {(cta || secondary) && (
        <EmptyContent className="relative z-10">
          <div className="flex flex-col items-center gap-2">
            {cta && <CTAButton cta={cta} />}
            {secondary && <CTAButton cta={secondary} variant="link" />}
          </div>
        </EmptyContent>
      )}
    </Empty>
  );
}

function CTAButton({
  cta,
  variant = "default",
}: {
  cta: CTA;
  variant?: "default" | "link";
}) {
  if (variant === "link") {
    if ("href" in cta && cta.href) {
      return (
        <Link
          href={cta.href}
          className="text-sm font-medium text-primary hover:underline"
        >
          {cta.label}
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={cta.onClick}
        className="text-sm font-medium text-primary hover:underline"
      >
        {cta.label}
      </button>
    );
  }

  if ("href" in cta && cta.href) {
    return (
      <Link href={cta.href}>
        <Button className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
          {cta.label}
        </Button>
      </Link>
    );
  }
  return (
    <Button
      onClick={cta.onClick}
      className="rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
    >
      {cta.label}
    </Button>
  );
}
