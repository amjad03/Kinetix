# Research, projects and IPR: user guide

For the research coordinator (research office), the principal, heads of department, the IQAC (reports only), teachers
(Teacher App, and their own records in the ERP lists) and research scholars. ERP: **Research** (views **Overview**,
**Outputs and IPR**, **Funding**, **Consultancy and collaboration**, **Scholars**, **Facilities and ethics**,
**Reports**). Settings: **Settings → Research**. Teacher App: **Profile → Research**.

## Settings

| Setting | What it does |
|---|---|
| Project code (PRJ) | Numbering of projects registered from approved proposals |
| Similarity limit (%) | Above it a thesis cannot go to examiners without the office's override and a reason. Default 10% (UGC 2018: up to 10% is level 0) |
| Default supervisor cap | For a teacher with no cap set and no designation the UGC 2022 caps know (Professor 8, Associate Professor 6, Assistant Professor 4) |
| Co-author incentive (%) | A co-author on the staff is paid this share of the first author's incentive (default 50%) |
| Progress report every (months) | Six months by default (UGC 2022) |

## Researcher profiles

- Each teacher keeps their ORCID iD, Scopus Author ID, Web of Science ResearcherID, Google Scholar and Vidwan IDs in
  the Teacher App (**My research → Edit identifiers**) or in **Outputs and IPR → Research profiles**. Profile links
  are fine: the ID is read from them. An ORCID iD is checked (its last character is a check digit) and belongs to one
  teacher only.
- The research office opens **Research profiles** and uses **Mark verified** after checking the IDs. A teacher's later
  change to an ID clears the verification; updating the h-index or citations does not.
- **Reports → Faculty research profile** shows a teacher's publications (as owner or co-author), citations, h-index and
  i10-index from the records, projects and grants, IPR, consultancy, recognitions and scholars, with an Excel download.

## Publications

1. **Add by DOI** reads the paper from Crossref. If the registry cannot be reached, a DOI seen before is answered from
   the copy kept then; otherwise type the title, venue and year and the record is kept as *waiting for the DOI
   registry*. **Refresh pending DOIs** completes them once the registry is back.
2. **Import from ORCID** adds a teacher's public works once each.
3. Or **Add**, or **Import** the Excel template. Authors are names separated by semicolons; staff are credited by name,
   so a paper with co-authors in several departments or institutions is one record and counts once.
4. A paper already on record is refused: the same DOI, or the same title (case, spacing and punctuation aside) in the
   same or the next year. Two papers with different DOIs are never duplicates.
5. Record indexing (Scopus, Web of Science, UGC-CARE with its group, PubMed), quartile, impact factor and citations. A
   retracted paper needs the retraction date; it stays on record and stops counting in every report.

## Funded projects

1. **Funding calls**: agency, scheme, internal and agency deadlines; the overview flags calls closing in 14 days. A
   proposal answering a call cannot be submitted after its internal deadline.
2. **Proposals** go draft → submitted → under review → approved (a project is registered) or rejected; one needing
   ethics clearance waits for the ethics approval.
3. **Grants**: agency, its kind (government, non-government, international, industry: NAAC 3.1 counts them apart),
   scheme, sanction reference and amount, period, overhead %.
4. **Budget heads**: what the sanction allows under manpower, equipment, consumables, travel, contingency and
   overhead. The heads cannot add up to more than the sanction.
5. **Fund releases**: each instalment the agency releases, with the date it reached the account.
6. Expenses (project page, or the API) name their budget head. One is refused when it goes past its head, past the
   sanction, or past what has been released so far.
7. **Reports → Grant statement and utilisation certificate**: choose a grant to see sanctioned, released, still to be
   released, spent, unspent, overhead, the period's utilisation (unspent at the start, received, available, spent,
   unspent at the end) and each head. **Utilisation certificate (12-A)** downloads it as a workbook in the GFR 2017
   form 12-A layout; keep the submitted certificate under **Utilisation certificates** (**Fill from expenses** takes
   the period's spending).
8. **Seed money**: the institution's own grants, with utilisation and the report.

## Incentives

1. **Funding → Incentive schemes**: add the scheme (for publications or patents), its period and the most a teacher
   may receive in a financial year. **Set rates** takes rupees, one per line, for example `scopus_q1=25000`,
   `scopus_q2=15000`, `scopus=10000`, `wos=12000`, `ugc_care=5000`, `book=10000`, `book_chapter=4000`,
   `conference=2000`, `published=10000`, `granted=50000`.
2. A teacher claims from **Outputs and IPR → Incentive claims → Claim an incentive**: choose the scheme and their paper
   or patent. The amount is the best rate the paper qualifies for, the co-author share for a co-author, cut to what is
   left of the yearly limit. A paper can be claimed once a scheme.
3. The office **Approves** (never its own claim), **Rejects** with a reason (which frees the limit) or **Marks paid** with
   the payment reference. The teacher is told each time.

## Ph.D. scholars

1. **Scholars → Scholars**: register with the university registration number, mode, department, research centre,
   supervisor, fellowship and its agency, how they were admitted (NET, GATE, SET, entrance test, exempt), gender and
   category (for AISHE). The list shows the last day to submit (six years, eight for women).
2. **Research centres**: the centres the university recognises, with the order and validity (expiring ones are flagged).
3. Supervisors: the overview's **Supervisors** lists each teacher's cap and load; allocation refuses a supervisor at
   their cap.
4. **Coursework** and **Doctoral committee meetings** (with the next one due; **Doctoral committee: overdue** filter).
5. **Progress reports**: the supervisor records the six-monthly report; **Accept** with a rating or **Return for
   corrections** with what to fix (editing a returned report resubmits it). Periods cannot overlap.
6. Theses: synopsis → draft → submitted → examination → viva → awarded. Before examination: two examiners and a
   similarity check within the limit. **Record similarity report** keeps the university software's report (URKUND /
   Ouriginal, DrillBit, Turnitin, iThenticate) with its number, link, score and UGC level; the internal check compares
   with the institution's other theses. After the award, **Record Shodhganga deposit** with the handle.

## Collaboration, events and facilities

- **Consultancy** (consultancy, testing, corporate training) with the institution's share of revenue.
- **MoUs** and the activities under each; NAAC counts an MoU with an activity in the year as functional.
- **Seminars and conferences**: attended, presented or organised; for events organised give the kind (conference,
  seminar, workshop, FDP), what it was about (research methodology, IPR and entrepreneurship count for NAAC 3.2.2),
  participants and sponsorship.
- **Central instruments** with bookings and internal or external billing; **Ethics approvals** with expiry.

## Reports

| Report | What it shows |
|---|---|
| NIRF research and professional practice | Three financial years of sponsored research, consultancy, EDPs, publications and IPR (Excel) |
| NIRF research ratios | PU (indexed papers per faculty a year), QP (citations per paper), FPPP (research and consultancy per faculty in lakhs), IPR (published / granted); the institution's own inputs, which NIRF scores against all institutions |
| NAAC criterion 3 | 3.1 to 3.7 for five academic years from the records |
| NBA criterion 5 | CAY, CAYm1, CAYm2: papers, indexed papers, Ph.D.s awarded and being guided, sponsored research and consultancy (count and lakhs), patents, events organised (Excel with AISHE) |
| AISHE | Ph.D. enrolment as on 30 September by department, mode, category and women; Ph.D.s awarded; fellowships |
| Grant statement | As above, per grant and period |

The IQAC (quality officer) sees the **Reports** view only.

## Teacher App

**Profile → Research**: **My research** (publications with the indexed count, citations, h-index and i10, IPR filed
and granted, scholars guided and awarded; identifiers with their verification state and **Edit identifiers**; IPR;
incentive claims with their status), **Projects**, **Scholars** (open a thesis, submit a draft), **Publications**
(those recorded and co-authored; **Add by DOI**) and **Datasets**.
