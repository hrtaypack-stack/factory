<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Employee validation (codes, emails, no self/circular supervisor-manager chains, account linking) lives in the `validate_employee` DB trigger — UI writes go straight to `employees` and rely on it.
- Admin-table auditing (employees, departments, leave_types, user_roles) is done by the `audit_row_change` trigger; don't add manual audit inserts for those writes.
- Excel import goes through the `employees_import` RPC (validate first, then all-or-valid-only write in one transaction); supervisors/managers are resolved by email, never by ID.
- HR reports read the `leave_report` / `overtime_report` views (HR-only, one row per employee for overtime) with server-side filters and pagination; exports reuse the same filters.
- Overtime cost stays NULL until official rules exist — never compute or display an estimated cost.
- SheetJS is loaded lazily via `src/lib/excel.ts` only; keep it out of SSR/initial bundles.
