import { startTransition, type FormEvent } from "react";

/**
 * Submits a form to a useActionState action without React's automatic reset. A form
 * passed as `action={…}` is reset once the action finishes, which wipes what the
 * seller typed when the save is refused, and puts selects back to their first value
 * after it succeeds. Edit forms keep their fields; the saved values are what's shown.
 */
export function submitKeepingValues(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
}
