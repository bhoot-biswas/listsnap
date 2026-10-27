import Link, { type LinkProps } from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A link that looks like a button. Navigation stays a real <a>, so it works without JS and opens in new tabs. */
export function ButtonLink<R extends string>({
  className,
  variant,
  size,
  ...props
}: LinkProps<R> & VariantProps<typeof buttonVariants> & { className?: string; children: React.ReactNode }) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
