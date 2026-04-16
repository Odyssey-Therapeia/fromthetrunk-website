export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
};

/** Detect file type from filename extension. */
export function detectFileType(filename: string): "csv" | "xlsx" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return "unknown";
}

/** Parse a CSV string into headers and rows. */
export function parseCSV(text: string): ParsedFile {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Simple CSV line parser that handles quoted fields.
 * Does not handle escaped quotes within quotes -- good enough for most CSVs.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
