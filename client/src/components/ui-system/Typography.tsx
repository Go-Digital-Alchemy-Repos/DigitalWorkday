import { cn } from "@/lib/utils";

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export function PageTitle({ children, className, as: Component = "h1" }: TypographyProps) {
  return (
    <Component className={cn("text-2xl font-semibold tracking-tight", className)}>
      {children}
    </Component>
  );
}

export function SectionTitle({ children, className, as: Component = "h2" }: TypographyProps) {
  return (
    <Component className={cn("text-lg font-semibold tracking-tight", className)}>
      {children}
    </Component>
  );
}

export function BodyText({ children, className, as: Component = "p" }: TypographyProps) {
  return (
    <Component className={cn("text-sm leading-relaxed", className)}>
      {children}
    </Component>
  );
}

export function MutedText({ children, className, as: Component = "p" }: TypographyProps) {
  return (
    <Component className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </Component>
  );
}

export function LabelText({ children, className, as: Component = "span" }: TypographyProps) {
  return (
    <Component className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </Component>
  );
}
