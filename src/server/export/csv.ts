import "server-only";

/**
 * A CSV file the importers and spreadsheets all read the same way: a field is quoted only
 * when it must be, quotes doubled, line breaks kept inside quotes, CRLF between rows, and
 * a UTF-8 BOM so Excel shows Bangla instead of mojibake. Quoting only when needed matters:
 * WooCommerce's importer strips the BOM but then keeps the quotes of a quoted first
 * header, so `"Type"` never matched and every product came in as a simple one.
 */
export function csv(header: string[], rows: (string | number | null)[][]): string {
  const line = (fields: (string | number | null)[]) => fields.map(field).join(",");
  return `\uFEFF${[line(header), ...rows.map(line)].join("\r\n")}\r\n`;
}

function field(value: string | number | null): string {
  let s = value === null ? "" : String(value);
  // A spreadsheet runs a cell that starts with one of these as a formula. A leading space
  // stops that and is trimmed by the importers; an apostrophe would be kept as text. A
  // plain number such as WooCommerce's -1 (draft) is no formula and stays as it is.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = ` ${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
