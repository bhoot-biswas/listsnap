"use client";

/** Last-resort boundary: replaces the root layout, so it brings its own html and body. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, background: "#F7F8F6", color: "#14201A" }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong · কিছু একটা সমস্যা হয়েছে</h1>
        <p>Your work is saved. · আপনার কাজ সংরক্ষিত আছে।</p>
        <button
          onClick={reset}
          style={{ padding: "10px 16px", borderRadius: 8, background: "#0E7357", color: "#fff", border: 0 }}
        >
          Try again · আবার চেষ্টা করুন
        </button>
      </body>
    </html>
  );
}
