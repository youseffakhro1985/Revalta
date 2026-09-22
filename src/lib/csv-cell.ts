/** Quote a CSV cell and neutralize spreadsheet formula prefixes. */
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRow(values: unknown[], separator = ";") {
  return values.map(csvCell).join(separator);
}
