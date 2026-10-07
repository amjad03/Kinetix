# Kinetix OBE + Accreditation Detailed System Specification

> Note: this document defines a configurable OBE engine. Institutions must configure their approved regulatory/accreditation framework and calculation rules; Kinetix must not hard-code one accreditor's methodology.

## 1. OBE hierarchy

Kinetix must support the following hierarchy/configuration:

Institution Mission/Vision
→ PEOs
→ POs
→ PSOs
→ Programs
→ Courses/Subjects
→ COs
→ Units/Topics
→ Learning activities
→ Assessment instruments
→ Student evidence
→ Attainment
→ Improvement actions

The system must allow an institution to enable/disable levels that are not used in a specific framework.

## 2. Master entities

- ObeFramework
- ProgramMission
- ProgramEducationalObjective (PEO)
- ProgramOutcome (PO)
- ProgramSpecificOutcome (PSO)
- CourseOutcome (CO)
- OutcomeVersion
- OutcomeMapping
- CourseOutcomeMapping
- AssessmentInstrument
- AssessmentComponent
- AssessmentQuestion
- QuestionOutcomeMapping
- StudentEvidence
- DirectAttainmentResult
- IndirectAttainmentResult
- OutcomeAttainment
- AttainmentRule
- AttainmentThreshold
- EvidenceArtifact
- SurveyInstrument
- ImprovementAction
- AccreditationCycle
- AccreditationCriterion
- AccreditationMetric
- AccreditationSubmission
- ObeAuditEvent

## 3. Outcome lifecycle

Each outcome supports:

`DRAFT → REVIEW → APPROVED → ACTIVE → RETIRED`

Rules:

- approved outcomes are immutable in-place; create a new version instead
- historical attainment always points to the exact outcome version
- retirement is blocked if required by an active curriculum unless a replacement is mapped

## 4. CO definition

Each CO must support:

- code
- statement
- cognitive level/taxonomy metadata
- course
- academic period
- version
- status
- evidence requirements
- recommended assessment methods

## 5. Mapping engine

Supported matrices:

- CO → PO
- CO → PSO
- Course → CO
- Assessment question → CO
- Assessment component → CO
- Learning activity → CO

Mapping strength must be configurable, for example:

- 0 = no mapping
- 1 = low
- 2 = medium
- 3 = high

Do not hard-code these values; framework configuration defines allowed scale.

## 6. Direct attainment

Kinetix must support configurable rules such as:

- question-level evidence
- rubric-level evidence
- component-level marks
- practical/lab scores
- project/viva scores
- exam scores

The engine should support configurable weighting and normalization.

Illustrative calculation model:

`direct_attainment = Σ(component_score × component_weight)`

followed by a configurable normalization/threshold function.

## 7. Indirect attainment

Sources may include:

- graduate exit survey
- course exit survey
- student feedback
- employer feedback
- alumni feedback

Each source must have:

- instrument version
- respondent scope
- question-to-outcome mapping
- response scale
- weighting
- sampling rules
- minimum response threshold

## 8. Combined attainment

Institutions must be able to define:

`combined_attainment = direct_weight × direct + indirect_weight × indirect`

Weights are configuration, not constants.

## 9. Gap analysis

For each outcome the system should show:

- target
- actual
- gap
- trend
- confidence/coverage indicator
- weak contributing courses/assessments
- recommended improvement actions

## 10. Improvement action workflow

`IDENTIFIED → ASSIGNED → IN_PROGRESS → EVIDENCE_ADDED → VERIFIED → CLOSED`

Examples:

- add remedial lesson
- revise question blueprint
- increase practical exposure
- modify assessment weighting
- revise curriculum topic
- add simulation/lab
- faculty development action

## 11. Evidence management

Evidence must be versioned and linked to:

- institution
- program
- course
- CO/PO/PSO
- assessment
- academic period
- accreditation cycle

Supported evidence types:

- marks/grades
- answer scripts metadata
- question papers
- rubrics
- projects
- lab records
- survey results
- meeting minutes
- course files
- reports
- photos/media metadata

## 12. Accreditation workspace

An institution admin should be able to create an accreditation cycle and configure:

- framework
- criteria
- evidence requirements
- owners
- deadlines
- review workflow
- approval chain
- export package

## 13. Dashboards

### Course level

- CO attainment
- assessment contribution
- weak questions/topics
- trend

### Program level

- PO attainment
- PSO attainment
- PEO status
- course contribution map
- gap analysis

### Institution level

- program coverage
- data completeness
- accreditation readiness
- outstanding evidence
- improvement actions

## 14. Permissions

- OBE_ADMIN
- PROGRAM_OUTCOME_MANAGER
- HOD
- FACULTY_OBE_EDITOR
- ASSESSMENT_EDITOR
- EVIDENCE_MANAGER
- REVIEWER
- AUDITOR
- VIEWER

All access must be tenant/institution scoped and audited.

## 15. Acceptance criteria

1. A program admin can define and version CO/PO/PSO records.
2. Faculty can map assessment components/questions to COs within permitted scope.
3. Approved mappings cannot be silently edited; revision creates a new version.
4. Attainment can be recalculated from source evidence deterministically.
5. Direct and indirect attainment can be configured separately.
6. A program dashboard identifies gaps against configurable targets.
7. Improvement actions have owners/status/dates/evidence.
8. Accreditation evidence can be assembled by cycle and exported.
9. Historical reports remain reproducible after curriculum/mapping changes.
10. Every sensitive change produces an audit event.
