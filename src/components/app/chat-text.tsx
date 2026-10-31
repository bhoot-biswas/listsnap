import { Fragment } from "react";

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

/**
 * The model's reply with the little formatting it uses: paragraphs, bullet and numbered
 * lists, and **bold**. Everything else stays plain text; nothing the model writes becomes
 * a link or HTML.
 */
export function ChatText({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const last = blocks.at(-1);
    const list = BULLET.test(line) ? "ul" : NUMBER.test(line) ? "ol" : null;
    if (list) {
      const item = line.replace(list === "ul" ? BULLET : NUMBER, "");
      if (last?.kind === list) last.items.push(item);
      else blocks.push({ kind: list, items: [item] });
    } else if (!line.trim()) {
      if (last?.kind === "p" || last?.kind === "ul" || last?.kind === "ol") blocks.push({ kind: "p", lines: [] });
    } else if (last?.kind === "p") last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }

  return blocks.map((b, i) =>
    b.kind === "p" ? (
      b.lines.length > 0 && (
        <p key={i}>
          {b.lines.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <Inline text={l} />
            </Fragment>
          ))}
        </p>
      )
    ) : (
      <b.kind key={i} className={b.kind === "ul" ? "list-disc pl-5" : "list-decimal pl-5"}>
        {b.items.map((item, j) => (
          <li key={j}>
            <Inline text={item} />
          </li>
        ))}
      </b.kind>
    ),
  );
}

function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
