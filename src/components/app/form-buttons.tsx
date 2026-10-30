"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

/** A form's submit button that shows the form is working, so a slow store check isn't tapped twice. */
export function PendingButton({ children, disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}

/**
 * A submit button for something that can't be taken back with one tap (disconnecting a
 * store). The first tap asks, inline and in the seller's words; only "yes" submits.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  cancelLabel,
  className,
}: {
  children: React.ReactNode;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button type="button" variant="ghost" className={className} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  return (
    <div role="group" aria-label={question} className="space-y-2 rounded-lg border border-destructive/40 p-3">
      <p className="text-sm font-medium">{question}</p>
      <div className="flex flex-wrap gap-2">
        <PendingButton variant="destructive" className="h-11 md:h-9">
          {confirmLabel}
        </PendingButton>
        {/* autoFocus: the question replaced the button that had focus */}
        <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => setAsking(false)} autoFocus>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
