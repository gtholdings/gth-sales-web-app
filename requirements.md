# GTH Sales — Software Requirements Specification

**Product:** GTH Sales — a sales & installment-management Progressive Web App for
Global Tech Holdings (a Sri Lankan Dialog TV dealer).
**Status:** Living document. Captures the agreed business and system requirements.
**Audience:** Engineering, QA, and the business owner.

---

## 1. Overview & Goals
Field sales representatives sell Dialog TV connections to customers, typically on an
**installment plan** (a down payment plus a number of monthly installments). The
business needs a single web application that:
- lets reps capture sales and the proposed payment plan at the customer site (mobile);
- routes each sale through an approval + physical-installation + down-payment-collection
  workflow handled by supervisors/managers;
- tracks every installment payment with a credit-officer confirmation step and a full audit trail;
- proactively reminds staff of upcoming and overdue payments;
- gives management reporting (including defaulter tracking) with Excel export;
- operates bilingually in **English and Sinhala**.

It runs at **$0/month** on free tiers (Next.js on Netlify; Supabase Postgres/Auth; Resend email).

## 2. Users & Roles
Organisation hierarchy (each user reports to the level above via `reports_to`):

| Role | Responsibilities | Data visibility |
|------|------------------|-----------------|
| **Rep** | Create sales + propose payment plans. Never collects money. | Own sales |
| **Supervisor** | Approve sales, confirm installation date, collect down payment, sign agreement, amend the plan. | Own + their reps |
| **Manager** | Everything a supervisor does, across their supervisors. | Own + supervisors + their reps |
| **Admin (MD)** | Full access; user management; configuration. | All |
| **Credit Officer** | Confirm payments against the bank; view reports. | All |

(Note: "Supervisor" is the canonical term throughout the system, including the database.)

## 3. Authentication & Accounts
- **R-AUTH-1** Users log in with their **mobile number** (Sri Lankan format: `07` + 8 digits)
  and a password. Mobile number is the unique account identifier.
- **R-AUTH-2** Email is **optional**, captured for communications only — never used to log in.
- **R-AUTH-3** Self-registration is open; new accounts are **Pending** until an admin approves
  them (and may assign role + reporting supervisor/manager at approval).
- **R-AUTH-4** Account states: Pending → Active → Inactive. Only Active users can log in.
- **R-AUTH-5** Access control is enforced server-side per role and per org-scope on every request.

## 4. Sales Capture (Rep)
- **R-SALE-1** A rep records: customer name, NIC, permanent address, personal phone,
  optional office phone.
- **R-SALE-2** NIC must be valid Sri Lankan format (9 digits + V/X, or 12 digits).
- **R-SALE-3** The rep enters the **proposed payment plan**: Total Value, Down Payment;
  **Loan Amount auto-calculates** (Total − Down). The rep enters the **Number of
  Installments**; the **Monthly Installment auto-calculates** (Loan ÷ N).
- **R-SALE-4** The rep enters a **proposed down-payment date** (agreed with the customer);
  the app previews the resulting installment dates.
- **R-SALE-5** The rep collects **no money** (not even the down payment). On submit the sale
  is **Pending** with the proposal stored; no installment schedule exists yet.
- **R-SALE-6** All sales are installment plans. Customer text (name/address) may be entered in Sinhala.

## 5. Approval, Installation & Down-Payment Collection (Supervisor/Manager)
- **R-APPR-1** A supervisor/manager reviews pending sales, coordinates a technician
  **installation date** offline, then records it in the app as the **down-payment date**.
- **R-APPR-2** At the installation visit the customer may change the **down-payment date,
  down-payment amount, and/or number of installments**. The supervisor/manager can amend
  all three on the approval screen (pre-filled from the rep's proposal).
- **R-APPR-3** **Approving generates the installment schedule** and marks the sale Active/Approved.
  Approval represents collecting the down payment and signing the agreement.
- **R-APPR-4** **Amendment audit:** if the approved values differ from the rep's proposed
  values, the system records an audit entry capturing the change (old → new), preserved in
  the sale's history/comments with author and timestamp.
- **R-APPR-5** A pending sale may instead be **rejected** (with notes), recorded in history.

## 6. Installment Scheduling
- **R-SCH-1** The **down payment** is due on the down-payment date.
- **R-SCH-2** Installment *k* (1..N) is due on the **same day-of-month**, *k* months after the
  down-payment date.
- **R-SCH-3** **Month-end rule:** when that day-of-month does not exist in the target month,
  the due date **clamps to the last day of that month** (e.g. down payment Jan 31 → Feb 28 (or
  29 in a leap year), May 31 → Jun 30); the original day resumes in later months.
- **R-SCH-4** Installment amounts split the loan evenly to the cent; the final installment
  absorbs any rounding remainder so the sum equals the loan exactly.

## 7. Payment Tracking, Confirmation & Audit
- **R-PAY-1** Each payable (the down payment and every installment) has a state:
  Pending → Awaiting Confirmation → Paid; plus Overdue and Defaulted (derived from due date).
- **R-PAY-2** Any in-scope user can **mark a payment as paid** (a claim); it then awaits the credit officer.
  The down payment is auto-claimed by the supervisor at approval.
- **R-PAY-3** **The credit officer confirms** a claimed payment after verifying the bank deposit, or
  **rejects** it back to unpaid.
- **R-PAY-4** Users can add **comments** to a sale or a specific payment.
- **R-PAY-5** Every action (comment, claim, confirm, reject, approval, amendment) is an
  **audit event recording the author and timestamp** (and amount/note where relevant), shown
  as the sale's activity history.
- **R-PAY-6** A sale becomes **Completed** when all payables are confirmed paid.
- **R-PAY-7** "Defaulted" = an unpaid payable overdue beyond a **configurable threshold**
  (default 30 days). Default amounts are attributed to the responsible rep.

## 8. Notifications (Reminders)
- **R-NOTIF-1** A daily job sends an **upcoming reminder 7 days before** a due date and an
  **overdue notice 1 day after** an unpaid due date.
- **R-NOTIF-2** Recipients are the relevant **staff**: the rep, their supervisor, their
  manager, and the credit officer. (Customer notifications are deferred; the notification layer is
  channel-agnostic with a clear extension point for SMS/WhatsApp.)
- **R-NOTIF-3** Reminder thresholds (days-before, days-after, default threshold) are configurable.
- **R-NOTIF-4** Sends are logged and de-duplicated (idempotent per day) for reliability.

## 9. Reporting
- **R-RPT-1** Reports cover a selectable **time range**: Month-to-date, Last month,
  Last 90 days, or a Custom from/to range.
- **R-RPT-2** Results can be **grouped by month or week** and **filtered by manager,
  supervisor, or rep** (never exceeding the viewer's data scope).
- **R-RPT-3** Metrics per period: number of sales, cumulative confirmed sales total, amount
  paid, amount pending, and amount defaulted.
- **R-RPT-4** A **defaulter report** lists each rep with their defaulted count and outstanding
  defaulted amount (so the credit officer can action salary deductions in a separate process).
- **R-RPT-5** Reports are **exportable to Excel (.xlsx)**.

## 10. Administration
- **R-ADM-1** Admin approves/activates pending users and sets role + reporting line.
- **R-ADM-2** Admin can manage configuration values (installment options, thresholds,
  credit-officer notification recipients).

## 11. Internationalisation
- **R-I18N-1** The entire UI (labels, buttons, messages) is available in **English and Sinhala**.
- **R-I18N-2** A **language switcher** in the top navigation toggles language **instantly**
  (no reload) and the choice persists.
- **R-I18N-3** Users can **enter data in Sinhala** (e.g. customer name/address).
- **R-I18N-4** **Amounts are always shown in Sri Lankan Rupees as "Rs."**; amounts and dates
  are not translated.

## 12. Non-Functional Requirements
- **R-NFR-1 Platform/cost:** PWA installable on mobile (Android/iOS "Add to Home Screen");
  deployed on Netlify; Supabase backend; Resend email; target **$0/month**.
- **R-NFR-2 Security:** all data access and authorisation enforced in the application/API
  layer using a server-side secret key; no public/anon database access; secrets never exposed
  to the client (`NEXT_PUBLIC_*` values are intentionally public).
- **R-NFR-3 Time zone:** all date logic (due dates, "today", reminders, report ranges) is
  computed in **Asia/Colombo**.
- **R-NFR-4 Observability:** structured server-side logging of requests, auth outcomes, and errors.
- **R-NFR-5 Auditability:** all money-related and plan-changing actions are immutably logged
  with actor and timestamp.
- **R-NFR-6 Portability:** business/auth logic lives in the application so the backend host can
  be changed with bounded effort.

## 13. Assumptions & Constraints
- Sri Lankan mobile numbers only (`07` + 8 digits); strict validation.
- Phone authentication is implemented over password auth (no SMS/OTP cost).
- The customer notice channel (SMS/WhatsApp) is a future enhancement.
- Full up-front (non-installment) payment is out of scope for the capture form.
- Free-tier service limits are sufficient for the expected volume (≈200 reps, ~50 sales/day).
