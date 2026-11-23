import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "supabase", "migrations");
const migrationFile = readdirSync(migrationsDir).find((name) => {
  if (!name.endsWith(".sql")) return false;
  return readFileSync(join(migrationsDir, name), "utf8").includes("guard_hr_self_approval_route");
});

if (!migrationFile) throw new Error("Self-approval safeguards migration was not found");
const migration = readFileSync(join(migrationsDir, migrationFile), "utf8");

test("HR cannot weaken their own leave review route", () => {
  assert.match(migration, /NEW\.requires_manager_approval = false/);
  assert.match(migration, /NEW\.manager_id IS NULL/);
  assert.match(migration, /OLD\.profile_id = auth\.uid\(\)/);
});

test("direct leave updates cannot approve the HR user's own request", () => {
  assert.match(migration, /USING \(public\.is_hr\(\) AND employee_id IS DISTINCT FROM public\.my_employee_id\(\)\)/);
  assert.match(migration, /WITH CHECK \(public\.is_hr\(\) AND employee_id IS DISTINCT FROM public\.my_employee_id\(\)\)/);
});

test("the leave decision function skips the HR user's own request", () => {
  assert.match(migration, /IF _action = 'approve' AND _req\.employee_id = _me THEN CONTINUE; END IF;/);
});

test("HR cannot approve overtime containing their own employee record", () => {
  assert.match(migration, /IF _hr AND _action = 'approve' AND EXISTS \([\s\S]*?e\.profile_id = _uid[\s\S]*?\) THEN\s+CONTINUE;/);
  assert.match(migration, /NEW\.status = 'approved'::public\.request_status[\s\S]*?e\.profile_id = auth\.uid\(\)/);
});