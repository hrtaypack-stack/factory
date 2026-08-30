# Build a brand-new web application for factory Leave Management and Overtime Management

Build a brand-new web application for factory Leave Management and Overtime Management.

IMPORTANT:

This is a NEW and SEPARATE project from any previous application.

Do not copy an old project blindly.

However, use the following requirements as the complete foundation for this project.

The application is intended for a factory environment where approximately 90% of users will access the system from Android mobile phones, while HR will primarily use a desktop computer.

==================================================

1. CORE SCOPE

==================================================

The system has ONLY two operational areas:

1. Leave Management

2. Overtime Work Assignments

DO NOT create modules for:

- Permissions / short permission requests

- Business trips

- Missions / travel requests

- Any unrelated HR processes

The system must be designed so additional modules could be added in the future without rebuilding the architecture.

==================================================

2. LANGUAGE & UI

==================================================

The entire user-facing application MUST be Arabic.

This means:

- Arabic UI text

- Arabic buttons

- Arabic labels

- Arabic menus

- Arabic validation messages

- Arabic error messages

- Arabic success messages

- Arabic empty states

- Arabic confirmation dialogs

- Arabic dashboard titles

- Arabic table headers

- Arabic filters

- Arabic notifications

- Arabic status names

- Arabic form instructions

The application MUST use RTL layout.

Do not expose English UI text to users.

Technical code, database column names, internal identifiers, API names, and developer comments may remain in English, but NOTHING technical should unnecessarily appear in the visible user interface.

Use professional Modern Standard Arabic suitable for a factory HR system.

==================================================

3. DESIGN PRINCIPLES

==================================================

Use a clean, professional HR management interface.

Prioritize:

- Clarity

- Speed

- Simple navigation

- Large touch-friendly controls

- Excellent mobile usability

- Responsive desktop layout

- Consistent Arabic RTL design

- Minimal unnecessary animations

- Clear status indicators

- Clear approval workflows

The mobile experience is a PRIMARY requirement, not an afterthought.

Do NOT design a desktop table and simply shrink it for mobile.

Use responsive layouts, cards, compact rows, bottom sheets, dropdowns, and appropriate mobile components where necessary.

Avoid horizontal scrolling whenever possible.

Especially for overtime employee selection:

The employee name and that employee's shift selector MUST be visible together within the same mobile viewport. Users must NOT have to scroll horizontally to find the employee name and then scroll horizontally again to select the shift.

==================================================

4. AUTHENTICATION

==================================================

Use Supabase Authentication.

DO NOT create a separate authentication/account system inside Lovable.

All real user accounts must exist in Supabase Auth.

User types include:

1. HR

2. Manager

3. Supervisor

4. Employee

The system must associate each authenticated Supabase user with a profile and, where applicable, an employee record.

Use a proper relational structure rather than storing everything directly inside the authentication user record.

The architecture should support:

- One authenticated user -> one profile

- Profile -> employee record

- Employee -> department

- Employee -> supervisor where applicable

- Employee -> manager where applicable

- Role-based access control

==================================================

5. USER ROLES

==================================================

Create a role-based permission system.

Roles:

HR:

- Full system access

- Full employee management

- Full leave management

- Full overtime management

- Full approval authority

- Full reports access

- Full settings access

- Full organizational structure management

Manager:

- Can review requests that require manager approval

- Can approve or reject requests assigned to them

- Can view the employees/requests within their organizational scope

- Must NOT have HR-level administration permissions

Supervisor:

- Can submit leave requests for employees assigned to them

- Can submit overtime assignments for employees assigned to them

- Can view requests they submitted

- Can view relevant employees under their supervision

- Their approval workflow depends on whether they require manager approval

Employee:

- Can submit their own leave requests

- Can submit their own overtime requests if permitted by the business rules

- Can view their own submitted requests

- Can see the current status of their requests

IMPORTANT:

Do not assume that every supervisor requires manager approval.

Each supervisor must have a configurable property:

requires_manager_approval = true / false

If true:

Supervisor request workflow:

Supervisor -> Manager -> HR

If false:

Supervisor request workflow:

Supervisor -> HR

Similarly, an employee whose workflow requires manager approval follows:

Employee -> Manager -> HR

==================================================

6. ORGANIZATIONAL STRUCTURE

==================================================

The database architecture must support:

Company

  -> Departments

      -> Managers

          -> Supervisors

              -> Employees

However, do not hard-code this as a rigid hierarchy that prevents future changes.

Employees must have:

- Employee Code

- Full Name

- Department

- Active / Inactive status

- Supervisor

- Manager where applicable

- Email where applicable

- Supabase user relationship where applicable

Employee Code is extremely important.

Do NOT use employee name as the primary business identifier.

Employee Code must be unique and indexed.

The system must allow searching employees by:

- Employee Code

- Employee Name

- Department

==================================================

7. DATABASE ARCHITECTURE

==================================================

Create a clean relational Supabase/PostgreSQL schema.

At minimum, prepare the foundation for these entities:

profiles

employees

departments

managers

supervisors

leave_types

leave_requests

overtime_requests

overtime_request_employees

audit_logs

You may introduce additional supporting tables if they are technically necessary.

Do NOT create a separate database/table/file for every month.

The database must support:

- Multiple years

- Historical records

- Future years

- Large employee counts

- Reporting across date ranges

Use proper foreign keys.

Use timestamps.

Use created_at and updated_at where appropriate.

Use UUIDs for internal database primary keys where appropriate, while maintaining Employee Code as the business identifier.

==================================================

8. SECURITY & RLS

==================================================

Security is critical.

Use Supabase Row Level Security (RLS).

Do NOT rely only on frontend route protection.

Database-level permissions must prevent unauthorized users from reading or modifying records.

HR:

- Full access according to HR permissions

Manager:

- Access only to requests and employees within their approval scope

Supervisor:

- Access only to employees assigned to them and requests they are authorized to manage

Employee:

- Access only to their own data and requests

Never expose sensitive employee data unnecessarily.

Do not use insecure client-side-only authorization.

==================================================

9. APPROVAL STATUS ARCHITECTURE

==================================================

Create a consistent approval status architecture that can be used by both Leave Requests and Overtime Requests.

The system must distinguish between:

- Pending Manager Approval

- Pending HR Approval

- Approved

- Rejected

- Cancelled

Use internal English enum/database values if technically preferable, but display the status in Arabic in the UI.

The architecture must allow the system to determine the next approval step automatically based on:

- Requester role

- Whether the requester requires manager approval

- Organizational relationship

- Current status

Do NOT hard-code a single workflow for everyone.

==================================================

10. AUDIT LOGGING

==================================================

Create an audit log foundation.

The system should be able to record important actions such as:

- Login-related important events where appropriate

- Request creation

- Request modification

- Approval

- Rejection

- Cancellation

- Employee creation

- Employee modification

- Role/permission changes

- Organizational relationship changes

- Import operations

Audit records should include where applicable:

- User

- Action

- Entity

- Entity ID

- Timestamp

- Previous value

- New value

The audit system must be extensible.

==================================================

11. APPLICATION STRUCTURE

==================================================

Prepare a clean navigation architecture.

For HR, the future navigation should support:

- Dashboard

- Leave Requests

- Overtime Assignments

- Employees

- Import Employees

- Supervisors & Managers

- Leave Types

- Leave Reports

- Overtime Cost Reports

- Settings

For other users, navigation must be role-aware.

Do not show HR-only pages to employees or supervisors.

==================================================

12. DASHBOARD FOUNDATION

==================================================

Create the dashboard architecture so each role can have a different dashboard.

HR dashboard will eventually contain statistics such as:

- Total employees

- Active employees

- Inactive employees

- Pending manager approvals

- Pending HR approvals

- Approved leave requests

- Rejected leave requests

- Overtime assignments

- Overtime costs

Do not fabricate statistics.

Use real database queries once the corresponding modules are implemented.

==================================================

13. MOBILE-FIRST REQUIREMENTS

==================================================

The application must be optimized for Android phone screens first.

Requirements:

- Responsive RTL layout

- Touch-friendly buttons

- Comfortable form controls

- No tiny text

- No unnecessary horizontal scrolling

- No desktop-only interactions

- Forms should be easy to complete with one hand where practical

- Dropdowns should be usable on small screens

- Multi-select employee selection should work properly on mobile

For multi-employee overtime selection, use a mobile-friendly interaction such as:

- Dropdown + checkbox list

- Bottom sheet

- Modal selection panel

After selecting employees, display the selected employees as individual rows/cards.

Each employee row must show:

Employee Name + Shift Selector

within the same visible mobile area.

Do NOT create a wide table requiring horizontal scrolling for this workflow.

==================================================

14. TECHNICAL QUALITY

==================================================

Use a maintainable component-based architecture.

Keep business logic separate from presentation where appropriate.

Avoid duplicated logic.

Use reusable components for:

- Status badges

- Filters

- Search fields

- Approval actions

- Confirmation dialogs

- Forms

- Employee selectors

- Date inputs

- Empty states

- Loading states

- Error states

Use proper loading and error handling.

Do not silently fail.

Show clear Arabic feedback to users.

==================================================

15. IMPORTANT IMPLEMENTATION RULES

==================================================

1. This is a NEW project.

2. Use Supabase Auth for all real accounts.

3. Use Supabase/PostgreSQL for persistent data.

4. Use RLS for database security.

5. Employee Code is a critical business identifier.

6. Everything visible to users must be Arabic and RTL.

7. Mobile-first design is mandatory.

8. Do not add Permissions or Business Trips modules.

9. Do not invent business rules that were not specified.

10. Do not create fake authentication.

11. Do not create fake employee data as if it were real.

12. Do not hard-code approval workflows.

13. Build the foundation so Leave and Overtime modules can be added cleanly.

14. Preserve data integrity with proper foreign keys and constraints.

15. Design for multiple years and large numbers of employees.

==================================================

16. FIRST IMPLEMENTATION TASK

==================================================

For this first phase, focus on the FOUNDATION.

Implement:

- Supabase connection

- Supabase Authentication

- Profile structure

- Employee structure

- Departments

- Manager/Supervisor relationships

- Roles

- Permissions foundation

- RLS foundation

- Approval workflow foundation

- Audit log foundation

- Arabic RTL application shell

- Responsive navigation

- Role-based routing

- Role-based dashboard placeholders

- Clean responsive UI foundation

Do NOT fully implement the Leave Management or Overtime Management workflows yet.

Those will be implemented in subsequent phases.

Before finishing this phase, verify that:

- Authentication works through Supabase

- Users are correctly associated with profiles

- Roles are respected

- HR can access the HR area

- Unauthorized users cannot access HR-only routes

- RLS is configured

- Arabic RTL layout works correctly

- Mobile layout works correctly

- The database relationships are ready for the next phases

Do not move forward by creating fake/mock backend logic.

Build the real foundation first.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/59e2fd44-e7a2-416c-aa83-6aae472a56b1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
