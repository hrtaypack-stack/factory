import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RequireRole } from "@/components/common/require-role";
import { downloadTemplate, readFirstSheet } from "@/lib/excel";
import { employeeErrorMessage } from "@/lib/employees";

export const Route = createFileRoute("/_authenticated/employees-import")({
  head: () => ({
    meta: [
      { title: "استيراد الموظفين | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "استيراد بيانات الموظفين من ملف Excel مع التحقق والمعاينة قبل الحفظ." },
      { property: "og:title", content: "استيراد الموظفين | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "استيراد بيانات الموظفين من ملف Excel مع التحقق والمعاينة قبل الحفظ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <ImportPage />
    </RequireRole>
  ),
});

/** Template columns: Arabic header ↔ payload key. */
const COLUMNS = [
  { key: "employee_code", header: "كود الموظف", required: true },
  { key: "full_name", header: "اسم الموظف", required: true },
  { key: "email", header: "البريد الإلكتروني" },
  { key: "department", header: "القسم" },
  { key: "job_title", header: "المسمى الوظيفي" },
  { key: "supervisor_email", header: "بريد المشرف" },
  { key: "manager_email", header: "بريد المدير" },
  { key: "is_active", header: "الحالة (نشط/غير نشط)" },
  { key: "requires_manager_approval", header: "يحتاج اعتماد المدير (نعم/لا)" },
] as const;

type Key = (typeof COLUMNS)[number]["key"];

interface ImportRowResult {
  row_no: number;
  employee_code: string | null;
  full_name: string | null;
  action: "new" | "update";
  errors: string[];
}
interface ImportResult {
  committed: boolean;
  total: number;
  invalid: number;
  new: number;
  update: number;
  rows: ImportRowResult[];
}

function parseBool(v: string, yes: string[], no: string[]): boolean | null | "invalid" {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (yes.includes(s)) return true;
  if (no.includes(s)) return false;
  return "invalid";
}

function ImportPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>[] | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<number, string[]>>({});
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const run = async (rows: Record<string, unknown>[], commit: boolean, skipInvalid: boolean) => {
    const { data, error } = await supabase.rpc("employees_import" as never, {
      _rows: rows,
      _commit: commit,
      _skip_invalid: skipInvalid,
    } as never);
    if (error) throw error;
    return data as unknown as ImportResult;
  };

  const validate = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => run(rows, false, false),
    onSuccess: setPreview,
    onError: (e) => setFileError(employeeErrorMessage(e)),
  });

  const commit = useMutation({
    mutationFn: (skipInvalid: boolean) => run(payload ?? [], true, skipInvalid),
    onSuccess: (r) => {
      if (!r.committed) {
        setPreview(r);
        toast.error("لم يتم الاستيراد: يوجد صفوف تحتوي على أخطاء.");
        return;
      }
      setDone(r);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["employees-admin"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("تم الاستيراد بنجاح");
    },
    onError: (e) => toast.error(employeeErrorMessage(e)),
  });

  const onFile = async (file: File) => {
    setFileError(null);
    setPreview(null);
    setDone(null);
    setFileName(file.name);
    try {
      const { headers, rows } = await readFirstSheet(file);
      const idx: Partial<Record<Key, number>> = {};
      for (const c of COLUMNS) {
        const i = headers.findIndex((h) => h === c.header || h.toLowerCase() === c.key);
        if (i >= 0) idx[c.key] = i;
      }
      const missing = COLUMNS.filter((c) => "required" in c && c.required && idx[c.key] === undefined);
      if (missing.length) {
        setFileError(`الأعمدة المطلوبة غير موجودة: ${missing.map((m) => m.header).join("، ")}. استخدم قالب الاستيراد.`);
        return;
      }
      if (rows.length === 0) {
        setFileError("الملف لا يحتوي على بيانات.");
        return;
      }
      const errs: Record<number, string[]> = {};
      const out = rows.map((r, n) => {
        const rowNo = n + 2;
        const get = (k: Key) => (idx[k] !== undefined ? r[idx[k]!] ?? "" : "");
        const active = parseBool(get("is_active"), ["نشط", "active", "1", "true", "نعم"], ["غير نشط", "inactive", "0", "false", "لا"]);
        const rma = parseBool(get("requires_manager_approval"), ["نعم", "yes", "1", "true"], ["لا", "no", "0", "false"]);
        const rowErr: string[] = [];
        if (active === "invalid") rowErr.push("قيمة الحالة غير صحيحة (نشط / غير نشط).");
        if (rma === "invalid") rowErr.push("قيمة اعتماد المدير غير صحيحة (نعم / لا).");
        if (rowErr.length) errs[rowNo] = rowErr;
        return {
          row_no: rowNo,
          employee_code: get("employee_code"),
          full_name: get("full_name"),
          email: get("email"),
          department: get("department"),
          job_title: get("job_title"),
          supervisor_email: get("supervisor_email"),
          manager_email: get("manager_email"),
          is_active: active === "invalid" ? null : active,
          requires_manager_approval: rma === "invalid" ? null : rma,
        };
      });
      setLocalErrors(errs);
      // rows with local format errors are excluded from the server payload and counted as errors
      const clean = out.filter((r) => !errs[r.row_no]);
      setPayload(clean);
      validate.mutate(clean);
    } catch {
      setFileError("تعذّر قراءة الملف. تأكد أنه ملف Excel صالح (xlsx).");
    }
  };

  const localCount = Object.keys(localErrors).length;
  const merged: ImportRowResult[] = preview
    ? [
        ...preview.rows,
        ...Object.entries(localErrors).map(([n, e]) => ({
          row_no: Number(n),
          employee_code: null,
          full_name: null,
          action: "new" as const,
          errors: e,
        })),
      ].sort((a, b) => a.row_no - b.row_no)
    : [];
  const invalidTotal = (preview?.invalid ?? 0) + localCount;
  const validTotal = (preview?.new ?? 0) + (preview?.update ?? 0);
  const shown = onlyErrors ? merged.filter((r) => r.errors.length) : merged;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">استيراد الموظفين</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          يتم التحقق من الملف بالكامل وعرض المعاينة قبل حفظ أي بيانات. يُستخدم البريد الإلكتروني لتحديد المشرف والمدير.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="surface-card space-y-2 p-4">
          <p className="font-semibold">١. تحميل قالب الاستيراد</p>
          <p className="text-sm text-muted-foreground">املأ القالب ببيانات الموظفين. الخلايا الفارغة لا تغيّر القيم الحالية للموظفين الموجودين.</p>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() =>
              downloadTemplate(
                "قالب_استيراد_الموظفين.xlsx",
                COLUMNS.map((c) => c.header),
                ["E1001", "محمد أحمد", "m.ahmed@company.com", "الإنتاج", "فني", "supervisor@company.com", "manager@company.com", "نشط", "نعم"],
                [
                  "تعليمات الاستيراد:",
                  "• احذف صف المثال قبل الرفع.",
                  "• كود الموظف واسم الموظف حقول إلزامية، وكود الموظف يجب أن يكون فريدًا.",
                  "• القسم: اكتب اسم القسم أو رمزه كما هو مسجل في النظام.",
                  "• بريد المشرف / بريد المدير: بريد موظف مسجل في النظام أو موجود في نفس الملف.",
                  "• الحالة: نشط أو غير نشط. اعتماد المدير: نعم أو لا.",
                  "• إذا كان كود الموظف موجودًا مسبقًا فسيتم تحديث بياناته.",
                ],
              )
            }
          >
            <Download className="size-4" /> تحميل قالب الاستيراد
          </Button>
        </div>
        <div className="surface-card space-y-2 p-4">
          <p className="font-semibold">٢. رفع ملف Excel</p>
          <p className="truncate text-sm text-muted-foreground">{fileName ?? "لم يتم اختيار ملف"}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button className="h-11 w-full" onClick={() => inputRef.current?.click()} disabled={validate.isPending}>
            <Upload className="size-4" /> {validate.isPending ? "جارٍ التحقق…" : "رفع ملف Excel"}
          </Button>
        </div>
      </div>

      {fileError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{fileError}</p> : null}

      {done ? (
        <div className="surface-card space-y-2 p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-success">
            <CheckCircle2 className="size-6" /> تم الاستيراد بنجاح
          </p>
          <p>عدد الموظفين الجدد: <b className="tabular-nums">{done.new}</b></p>
          <p>عدد الموظفين الذين تم تحديثهم: <b className="tabular-nums">{done.update}</b></p>
          <p>عدد الصفوف التي تحتوي على أخطاء (لم تُستورد): <b className="tabular-nums">{done.invalid + localCount}</b></p>
          <Button asChild variant="outline" className="mt-2 h-11"><Link to="/employees">عرض الموظفين</Link></Button>
        </div>
      ) : null}

      {preview ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ["إجمالي الصفوف", preview.total + localCount],
              ["صفوف سليمة", validTotal],
              ["صفوف بها أخطاء", invalidTotal],
              ["موظفون جدد", preview.new],
              ["موظفون موجودون", preview.update],
              ["سيتم تحديثها", preview.update],
            ].map(([l, v]) => (
              <div key={l} className="surface-card p-3">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="text-2xl font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </section>

          <div className="surface-card space-y-3 p-4">
            {invalidTotal > 0 ? (
              <p className="rounded-lg bg-warning/15 p-3 text-sm">
                يحتوي الملف على {invalidTotal} صف به أخطاء. يمكنك تصحيح الملف وإعادة رفعه، أو استيراد الصفوف السليمة فقط ({validTotal}).
              </p>
            ) : (
              <p className="rounded-lg bg-success/10 p-3 text-sm">جميع الصفوف سليمة وجاهزة للاستيراد.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {invalidTotal === 0 ? (
                <Button className="h-11" disabled={commit.isPending || validTotal === 0} onClick={() => commit.mutate(false)}>
                  <FileSpreadsheet className="size-4" /> {commit.isPending ? "جارٍ الاستيراد…" : `تأكيد الاستيراد (${validTotal})`}
                </Button>
              ) : (
                <Button className="h-11" variant="outline" disabled={commit.isPending || validTotal === 0} onClick={() => commit.mutate(true)}>
                  {commit.isPending ? "جارٍ الاستيراد…" : `استيراد الصفوف السليمة فقط (${validTotal})`}
                </Button>
              )}
              <Button variant="ghost" className="h-11" onClick={() => setOnlyErrors((v) => !v)}>
                {onlyErrors ? "عرض كل الصفوف" : "عرض الأخطاء فقط"}
              </Button>
            </div>
          </div>

          <ul className="space-y-2">
            {shown.slice(0, 500).map((r) => (
              <li key={r.row_no} className={`surface-card p-3 text-sm ${r.errors.length ? "border-destructive/50" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="text-muted-foreground">صف {r.row_no}: </span>
                    <b className="tabular-nums">{r.employee_code ?? "—"}</b> — {r.full_name ?? "—"}
                  </span>
                  <span className={`text-xs font-semibold ${r.errors.length ? "text-destructive" : "text-success"}`}>
                    {r.errors.length ? "خطأ" : r.action === "new" ? "موظف جديد" : "تحديث"}
                  </span>
                </div>
                {r.errors.length ? (
                  <ul className="mt-1 list-inside list-disc text-destructive">
                    {r.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {shown.length > 500 ? <p className="text-center text-xs text-muted-foreground">يتم عرض أول ٥٠٠ صف فقط.</p> : null}
        </>
      ) : null}
    </div>
  );
}
