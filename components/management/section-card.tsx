"use client";
import { Card, Content } from "@react-spectrum/s2/Card";
import type { ReactNode } from "react";

/** One owner-workspace section in an S2 Card. S2 uses hooks, so this is a client boundary. */
export function SectionCard({
  children,
  className,
  label,
  labelledBy,
}: {
  children: ReactNode;
  /** Applied to the inner section, so existing section styles keep working. */
  className?: string;
  /** Names a section that has no visible heading. */
  label?: string;
  /** The id of the section's heading. Preferred over `label`. */
  labelledBy?: string;
}) {
  return (
    <Card
      size="XL"
      UNSAFE_className="section-card"
      UNSAFE_style={{
        backgroundColor: "var(--paper)",
        containerType: "inline-size",
        width: "100%",
      }}
    >
      <Content>
        <section
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy}
          className={className}
        >
          {children}
        </section>
      </Content>
    </Card>
  );
}
