# HR and payroll: completeness against Linways, Camu, greytHR and Keka (checklist section 9 and the HR brief)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 9, `HR_PAYROLL_DETAILED_SPEC.md` and the HR pass brief,
exercised against the Soundarya seed: API calls on a seeded database (port 4330), the ERP (port 3330) driven by
Playwright at 1280px and 390px (`apps/erp/scripts/hr-qa.mjs`, every page loads with no error, no sideways scroll and
no console errors), and the Teacher App's widget tests. **Before** is the branch when this pass started.

Status words: **Have** (built and tested before), **Built** (missing, partial or broken before, built now),
**Deepened** (existed, gaps closed now). Migrations: `0198_hr_identifiers_tax_declarations`,
`0199_hr_pay_matrix_settlement_careers`. New tests: `services/api/test/hr-pass.e2e.spec.ts` (8 workflows, figures
worked by hand in comments), `src/hr/hr-pass.logic.spec.ts` (13), `apps/teacher/test/tax_claims_test.dart` (3).

Counts (49 items): before **34 Have, 4 Partial, 8 Missing, 3 Broken**; after **49 Done** (34 Have, 15 Built or Deepened).

## Staff records and lifecycle

| Item | Before | After | Evidence |
|---|---|---|---|
| Staff master: personal, statutory, bank, Aadhaar, documents | Have | Have | `hr-master.controller.ts`, `staff-depth.records.ts`; `hr-depth-kit.e2e.spec.ts` |
| PAN and UAN encrypted at rest (audit finding) | Broken: clear text in `staff_profiles` and copied into every payslip's JSON | Built | Sealed columns `pan_enc`/`uan_enc` + last four (`hr/staff-ids.ts`, AES-256-GCM bound to institution, staff and field); payslip copies removed (0198); exports, 24Q, Form 16, NAAC/NIRF sources and document data decrypt from the record; `migrate` (built image) and `pnpm secrets:rotate` seal values kept in clear; test "keeps staff PAN and UAN encrypted at rest…" (binding, legacy value, rotation to key 2) |
| Onboarding checklist | Have | Have | `talent.controller.ts` onboarding |
| Probation and confirmation | Have | Have | `staff-changes.controller.ts`; `hr-lifecycle.e2e.spec.ts` |
| Transfer and promotion | Have | Have | `staff-changes.controller.ts` transfers |
| Resignation, notice, clearance by department | Have | Have | `exit.controller.ts` |
| Full and final settlement | Partial: HR typed one figure | Built | `hr/settlement.ts`, `settlement.service.ts`: unpaid days of the last month, leave encashment (≤300 days), gratuity (Act s.4, 4 yrs 240 days, ₹20 lakh cap), notice recovery (waivable), loans owed, clearance dues, extra lines; payroll skips the month the settlement paid; ERP settlement card; e2e figures 8,710 / 15,000 / 95,192 / −28,800 / −350 |
| Relieving letter and experience certificate | Have | Have | `exit.controller.ts` |
| Service book and increments | Have | Deepened | pay-matrix moves write increment / pay fixation / promotion entries |
| Qualifications, experience, publications with verification | Have | Have | `hr-depth.controller.ts` qualifications verify |
| Document verification | Have | Have | `staff-documents` kit list, verify action |
| AICTE faculty cadre ratio and SFR | Have | Have | reports `faculty-cadre`, `sfr` |
| UGC 2018 cadre qualification check | Missing | Built | `hr/cadre-eligibility.ts`, report `cadre-eligibility` (master's 55%/50% relaxed, NET/SET or Ph.D., years, publications); unit and e2e tests |
| Faculty data for NAAC/NIRF | Partial: PAN in clear; seed counted office staff as teaching | Deepened | PAN decrypted per row; seed marks non-teaching staff and cadres |

## Leave

| Item | Before | After | Evidence |
|---|---|---|---|
| CL, SL, EL, ML, duty (OD), compensatory off, LOP | Have | Have | `leave.service.ts` defaults |
| Vacation leave | Partial: a kind with no rule | Built | default `VL`; only inside declared vacations and for teaching staff (`vacationProblem`, HR settings `vacations`); no balance |
| Accrual and carry-forward | Have | Have | `leave-math.ts`, carry-forward endpoint |
| Encashment | Have | Have | `hr-workflows.controller.ts` encashments |
| Two-level approval chain | Have | Have | `hr-workflows.e2e.spec.ts` "routes leave through the head of department…" |
| Leave to attendance and loss of pay | Have | Have (verified) | `lop.ts`; `hr.e2e.spec.ts` |
| Substitute arrangement | Have | Have (verified) | `hr-depth-kit.e2e.spec.ts` arrange-substitutes |
| Delegation during leave | Have | Have | delegations kit; hr-depth-kit test fixed (below) |

## Payroll

| Item | Before | After | Evidence |
|---|---|---|---|
| Pay structures and components | Have | Have | `payroll.service.ts` |
| UGC/AICTE 7th CPC pay matrix | Missing | Built | `pay-matrix.logic.ts` (cells to nearest ₹100, matches the published Level 10 column), `pay-matrix.service.ts`: placement, idempotent annual increment (six months' service), pay fixation on promotion, HRA by city class; ERP Pay matrix; e2e 64,900 → 66,800 → 68,900 |
| DA revisions with arrears | Have | Have | `reviseRate`; hr-depth-kit test |
| Consolidated, contract and guest (hourly) staff | Partial: no pay basis | Built | `pay_basis`, `hourly_rate_paise`; `guest_hours` adjustment = hours × rate; hourly staff paid only their hours |
| PF, ESI, Karnataka PT, LWF | Have | Have | `payroll-math.ts`; `payroll-math.spec.ts` |
| TDS under old and new regimes | Have | Have | `monthlyTds`, `supplementaryTds` |
| Investment declarations and proofs (Form 12BB), HRA exemption | Missing: two numbers typed on the staff record | Built | `tax-declaration.logic.ts`, `tax-declarations.service.ts`: draft → submitted → approved (declared figures to TDS) → proofs → verified (accepted figures), send back, landlord PAN sealed; ERP self-service and review; Teacher App; e2e HRA 1,65,360, 80C 1,10,000 |
| Regime comparison | Missing | Built | declaration `estimate` (old and new tax on present pay); e2e new regime 89,220 |
| Form 16 | Have | Have | `form16-pdf.ts`; depth-quality test |
| Form 24Q | Have | Have | annexure I and II CSV (`payroll.service.ts`) |
| EPFO ECR | Have | Deepened | UAN from the encrypted record |
| Bank transfer files for SBI, Canara, HDFC | Missing: one generic CSV | Built | `bank-files.ts` (SBI CINB, Canara pipe file, HDFC ENet 28 columns; internal vs NEFT by IFSC); sealed debit account in payroll settings; `runs/:id/bank-file`; unit and e2e tests |
| Payslips: PDF, publish, app | Have | Have | `payroll.controller.ts`; Teacher App `payslips_screen.dart`, `hr_test.dart` |
| Loans and advances | Have | Have | `hr-workflows.controller.ts` loans |
| Reimbursements | Missing | Built | `reimbursements.service.ts`: claim with bill, yearly limits, approve onto a pay month as a non-wage adjustment (tax free or taxable by category); e2e ESI on 18,000 not 21,900 (135/585) |
| Payroll lock, approval, audit, reversal, supplementary | Have | Have | `transition`, `reverse`; depth tests |

## Performance, development and recruitment

| Item | Before | After | Evidence |
|---|---|---|---|
| Appraisal and API/PBAS scores (UGC CAS) | Have | Have | `talent.controller.ts`, `appraisal-math.ts` |
| Training and FDP records | Have | Have | training kit list, FDP summary report |
| Requisition and approval | Have | Have | `hr-workflows.controller.ts` requisitions |
| Job posting with online applications | Missing | Built | `careers.controller.ts` (`/v1/public/careers/:slug`), published flag on openings, honeypot, duplicate check, resume scan; e2e |
| Applicants, interview panel scoring | Have | Have | `hiring.controller.ts` |
| Offer, appointment letter, hire into the staff record | Have | Have | `talent.controller.ts`, `hiring.controller.ts` |

## Teacher App

| Item | Before | After | Evidence |
|---|---|---|---|
| Leave apply and approve | Have | Have (verified) | `leave_screen.dart`; `hr_test.dart` |
| Payslip list and PDF | Have | Have (verified) | `payslips_screen.dart`; `hr_test.dart` |
| Tax declaration, proofs and reimbursement claims | Missing (teachers cannot sign in to the ERP) | Built | `tax_claims_screen.dart`; `tax_claims_test.dart` (en/hi/kn) |

## Hardening

| Item | Before | After | Evidence |
|---|---|---|---|
| hr-depth-kit test | Broken: fixed October delegation dates had passed | Built | dates from the real date (`hr-depth-kit.e2e.spec.ts`) |
| HR reports' "today" | Broken: UTC date | Built | IST (`hr-reports.controller.ts`) |
| Roles and another institution | — | Checked | e2e: teacher refused on review, pay matrix, bank file and cadre report; accountant refused on placement and bank settings; another institution sees no declaration, claim or opening |
| Validation, money, idempotency | — | Checked | Zod bodies on every new endpoint; integer paise; increments and arrears idempotent; optimistic versions on declarations; paginated lists |

## Not done, and why

- Form 24Q is the annexure CSV, not the NSDL FVU text file (that file is produced by the government's FVU utility).
- The SBI, Canara and HDFC layouts follow the banks' published bulk-upload formats; each bank's corporate portal
  can add institution-specific columns, so check the first file with the bank.
- The HRA exemption is worked on the present salary structure × 12, not month by month.
