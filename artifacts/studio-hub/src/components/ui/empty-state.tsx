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

interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  subline?: string;
  cta?: CTA;
  secondary?: CTA;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  headline,
  subline,
  cta,
  secondary,
  className,
}: EmptyStateProps) {
  return (
    <Empty
      className={cn(
        "border-0 bg-transparent gap-4 py-10 md:py-12 px-6",
        className
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
          <Icon className="size-6" />
        </EmptyMedia>
        <EmptyTitle>{headline}</EmptyTitle>
        {subline && <EmptyDescription>{subline}</EmptyDescription>}
      </EmptyHeader>
      {(cta || secondary) && (
        <EmptyContent>
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
