/**
 * Excel helpers (client-side only). SheetJS is loaded lazily so it never
 * enters the SSR bundle or the initial page payload.
 */
export interface ExcelColumn<T> {
  label: string;
  value: (row: T) => string | number | Date | null | undefined;
  width?: number;
}

async function loadXlsx() {
  return await import("xlsx");
}

/** Parse "YYYY-MM-DD" (or ISO timestamp) into a real Date so Excel can sort/filter it. */
export function excelDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function exportToExcel<T>(
  fileName: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
) {
  const XLSX = await loadXlsx();
  const data = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => c.value(r) ?? "")),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true, dateNF: "yyyy-mm-dd" });
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 18 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

/** Read the first sheet as rows of raw cell text, keyed by header label. */
export async function readFirstSheet(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return { headers: [], rows: [] };
  const sheet = wb.Sheets[first]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const [head = [], ...body] = matrix;
  return {
    headers: head.map((h) => String(h ?? "").trim()),
    rows: body
      .map((r) => r.map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c !== "")),
  };
}

export async function downloadTemplate(
  fileName: string,
  headers: string[],
  example: string[],
  notes: string[],
) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 24 }));
  const help = XLSX.utils.aoa_to_sheet(notes.map((n) => [n]));
  help["!cols"] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }, { RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الموظفون");
  XLSX.utils.book_append_sheet(wb, help, "تعليمات");
  XLSX.writeFile(wb, fileName);
}
