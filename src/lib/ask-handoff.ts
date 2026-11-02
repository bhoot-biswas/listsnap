/**
 * A question from the Dashboard's ask box to the Assistant's start screen, through this
 * tab's session storage: it never appears in an address, so neither the browser's history
 * nor the server's logs keep it. Taken once, so a reload or Back doesn't send it again.
 */
const KEY = "listsnap:ask";

export function handAsk(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // storage turned off: the start screen opens without it, and the seller asks there
  }
}

export function takeAsk(): string | null {
  try {
    const text = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return text?.trim() || null;
  } catch {
    return null;
  }
}
