import { cn } from "@/lib/utils";

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export function PageTitle({ children, className, as: Component = "h1" }: TypographyProps) {
  return (
    <Component className={cn("text-h2", className)}>
      {children}
    </Component>
  );
}

export function SectionTitle({ children, className, as: Component = "h2" }: TypographyProps) {
  return (
    <Component className={cn("text-h3", className)}>
      {children}
    </Component>
  );
}

export function BodyText({ children, className, as: Component = "p" }: TypographyProps) {
  return (
    <Component className={cn("text-body leading-relaxed", className)}>
      {children}
    </Component>
  );
}

export function MutedText({ children, className, as: Component = "p" }: TypographyProps) {
  return (
    <Component className={cn("text-body text-muted-foreground", className)}>
      {children}
    </Component>
  );
}

export function LabelText({ children, className, as: Component = "span" }: TypographyProps) {
  return (
    <Component className={cn("text-overline text-muted-foreground", className)}>
      {children}
    </Component>
  );
}
