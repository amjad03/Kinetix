// What each tabbed desk loads and which forms it offers (see g1-desk.ts for the vocabulary).

import type { DeskAction, DeskColumn, DeskField, DeskSpec } from './g1-desk';

type Opts = NonNullable<DeskField['options']>;
const YES_NO: Opts = [{ value: 'yes', label: 'ops.yes' }, { value: 'no', label: 'ops.no' }];
const f = (name: string, label: DeskField['label'], extra: Partial<DeskField> = {}): DeskField => ({ name, label, ...extra });
const col = (key: string, label: DeskColumn['label'], type?: DeskColumn['type'], words?: string): DeskColumn => ({ key, label, type, words });
const tab = (id: string, label: DeskSpec['tabs'][number]['label'], empty: DeskSpec['tabs'][number]['empty'], load: string, columns: DeskColumn[], actions: DeskAction[] = [], extra: Partial<DeskSpec['tabs'][number]> = {}): DeskSpec['tabs'][number] => ({ id, label, empty, load, columns, actions, ...extra });
const act = (id: string, label: DeskAction['label'], method: DeskAction['method'], path: string, scope: DeskAction['scope'], fields: DeskField[] = [], extra: Partial<DeskAction> = {}): DeskAction => ({ id, label, method, path, scope, fields, ...extra });

const TYPES: Opts = ['school', 'puc_college', 'degree_college', 'autonomous_college', 'university', 'deemed_university', 'custom'].map((v) => ({ value: v, label: `g1.v.${v}` as never }));
const MODELS: Opts = ['GRADE_SECTION', 'PROGRAM_SEMESTER_COURSE', 'EARLY_YEARS', 'STREAM_COMBINATION', 'UNIVERSITY_MULTI_INSTITUTION'].map((v) => ({ value: v, label: `g1.v.${v}` as never }));
const GOVERNANCE: Opts = ['affiliated', 'autonomous', 'constituent', 'deemed'].map((v) => ({ value: v, label: `g1.v.${v}` as never }));

export const SETUP_DESK: DeskSpec = {
  id: 'setup',
  title: 'g1.setup.title',
  subtitle: 'g1.setup.subtitle',
  section: 'institutionSetup',
  filters: [],
  tabs: [
    tab('profile', 'g1.setup.tab.profile', 'g1.setup.empty', '/v1/admin/institution/setup', [col('item', 'g1.col.item', 'chip', 'g1.item.'), col('value', 'g1.col.value', 'chip', 'g1.v.')], [
      act('type', 'g1.setup.editType', 'PUT', '/v1/admin/institution/setup', 'tab', [
        f('institutionType', 'g1.f.institutionType', { options: TYPES }),
        f('structureModel', 'g1.f.structureModel', { options: MODELS }),
        f('governanceModel', 'g1.f.governanceModel', { options: GOVERNANCE }),
        f('feeModel', 'g1.f.feeModel'),
        f('qualityFramework', 'g1.f.qualityFramework'),
        f('languages', 'g1.f.languages', { to: 'list' }),
      ]),
      act('policy', 'g1.setup.editPolicy', 'PUT', '/v1/admin/institution/setup', 'tab', [
        f('aiPolicy.enabled', 'g1.f.aiEnabled', { to: 'bool', options: YES_NO }),
        f('aiPolicy.allowStudentFacing', 'g1.f.aiStudents', { to: 'bool', options: YES_NO }),
        f('aiPolicy.requireTeacherReview', 'g1.f.aiReview', { to: 'bool', options: YES_NO }),
        f('privacySettings.parentSeesMarks', 'g1.f.parentMarks', { to: 'bool', options: YES_NO }),
        f('privacySettings.showStudentPhotos', 'g1.f.photos', { to: 'bool', options: YES_NO }),
        f('commsChannels.push', 'g1.f.chPush', { to: 'bool', options: YES_NO }),
        f('commsChannels.sms', 'g1.f.chSms', { to: 'bool', options: YES_NO }),
        f('commsChannels.email', 'g1.f.chEmail', { to: 'bool', options: YES_NO }),
        f('commsChannels.whatsapp', 'g1.f.chWhatsapp', { to: 'bool', options: YES_NO }),
      ]),
      act('words', 'g1.setup.editWords', 'PUT', '/v1/admin/institution/setup', 'tab', [f('terminology', 'g1.f.terminology', { kind: 'multiline', to: 'pairs', required: true })]),
    ], { shape: 'setup', hint: 'g1.setup.profileHint' }),
    tab('presets', 'g1.setup.tab.presets', 'g1.setup.empty', '/v1/admin/institution/presets', [col('name', 'ops.f.name'), col('institutionType', 'g1.f.institutionType', 'chip', 'g1.v.'), col('structureModel', 'g1.f.structureModel', 'chip', 'g1.v.'), col('qualityFramework', 'g1.f.qualityFramework'), col('disabledModules', 'g1.col.off', 'count')], [
      act('apply', 'g1.setup.apply', 'POST', '/v1/admin/institution/presets/{key}/apply', 'row', [], { confirm: 'g1.setup.applyConfirm', showResult: true }),
    ], { hint: 'g1.setup.presetsHint' }),
    tab('boards', 'g1.setup.tab.boards', 'g1.setup.boardsEmpty', '/v1/admin/institution/boards', [col('code', 'g1.f.code'), col('name', 'ops.f.name'), col('kind', 'g1.f.kind', 'chip', 'g1.v.'), col('medium', 'g1.f.medium'), col('passRules.subjectPassPct', 'g1.f.subjectPass', 'pct'), col('passRules.graceMarks', 'g1.f.grace'), col('isPrimary', 'g1.col.primary', 'bool')], [
      act('add', 'g1.setup.addBoard', 'POST', '/v1/admin/institution/boards', 'tab', [
        f('code', 'g1.f.code', { required: true }),
        f('name', 'ops.f.name', { required: true }),
        f('kind', 'g1.f.kind', { options: ['central', 'state', 'international', 'university'].map((v) => ({ value: v, label: `g1.v.${v}` as never })), init: 'central' }),
        f('medium', 'g1.f.medium'),
        f('passRules.subjectPassPct', 'g1.f.subjectPass', { to: 'int' }),
        f('passRules.aggregatePassPct', 'g1.f.aggregatePass', { to: 'int' }),
        f('passRules.graceMarks', 'g1.f.grace', { to: 'int' }),
        f('passRules.maxCompartmentSubjects', 'g1.f.compartment', { to: 'int' }),
      ]),
      act('rules', 'g1.setup.editRules', 'PUT', '/v1/admin/institution/boards/{id}', 'row', [
        f('passRules.subjectPassPct', 'g1.f.subjectPass', { to: 'int', initFrom: 'passRules.subjectPassPct' }),
        f('passRules.aggregatePassPct', 'g1.f.aggregatePass', { to: 'int', initFrom: 'passRules.aggregatePassPct' }),
        f('passRules.graceMarks', 'g1.f.grace', { to: 'int', initFrom: 'passRules.graceMarks' }),
        f('passRules.maxCompartmentSubjects', 'g1.f.compartment', { to: 'int', initFrom: 'passRules.maxCompartmentSubjects' }),
      ]),
      act('primary', 'g1.setup.makePrimary', 'POST', '/v1/admin/institution/boards/{id}/primary', 'row', [], { when: { key: 'isPrimary', in: ['false'] } }),
    ]),
    tab('attendance', 'g1.setup.tab.attendance', 'g1.setup.empty', '/v1/admin/institution/attendance-overrides', [col('programName', 'g1.f.programme'), col('thresholdPct', 'g1.f.threshold', 'pct'), col('lockHours', 'g1.f.lockHours'), col('note', 'ops.f.note')], [
      act('set', 'g1.setup.setOverride', 'PUT', '/v1/admin/institution/attendance-overrides/{programId}', 'row', [f('thresholdPct', 'g1.f.threshold', { to: 'int', required: true, initFrom: 'thresholdPct' }), f('lockHours', 'g1.f.lockHours', { to: 'int', initFrom: 'lockHours', clearable: true }), f('note', 'ops.f.note', { initFrom: 'note' })]),
      act('clear', 'g1.setup.clearOverride', 'DELETE', '/v1/admin/institution/attendance-overrides/{programId}', 'row', [], { danger: true, confirm: 'g1.setup.clearConfirm' }),
    ], { hint: 'g1.setup.attendanceHint' }),
    tab('campuses', 'g1.setup.tab.campuses', 'g1.setup.empty', '/v1/admin/institution/campus-settings', [col('campusName', 'g1.f.campus'), col('feeModel', 'g1.f.feeModel'), col('gradingPolicy', 'g1.f.gradingPolicy')], [
      act('edit', 'common.edit', 'PUT', '/v1/admin/institution/campus-settings/{campusId}', 'row', [f('feeModel', 'g1.f.feeModel', { initFrom: 'feeModel', clearable: true }), f('gradingPolicy', 'g1.f.gradingPolicy', { initFrom: 'gradingPolicy', clearable: true })]),
    ]),
    tab('fees', 'g1.setup.tab.fees', 'g1.setup.feesEmpty', '/v1/admin/institution/fee-structures', [col('name', 'ops.f.name'), col('campusName', 'g1.f.campus'), col('programName', 'g1.f.programme'), col('totalPaise', 'ops.f.amount', 'paise'), col('dueInDays', 'g1.f.dueDays'), col('active', 'g1.col.active', 'bool')], [
      act('add', 'g1.setup.addFee', 'POST', '/v1/admin/institution/fee-structures', 'tab', [
        f('name', 'ops.f.name', { required: true }),
        f('campusId', 'g1.f.campus', { optionsFrom: 'campuses' }),
        f('programId', 'g1.f.programme', { optionsFrom: 'programs' }),
        f('items', 'g1.f.feeItems', { kind: 'multiline', to: 'items', required: true }),
        f('dueInDays', 'g1.f.dueDays', { to: 'int' }),
      ]),
      act('issue', 'g1.setup.issueFee', 'POST', '/v1/admin/institution/fee-structures/{id}/issue', 'row', [], { confirm: 'g1.setup.issueConfirm', showResult: true }),
    ], { hint: 'g1.setup.feesHint' }),
    tab('faculties', 'g1.setup.tab.faculties', 'g1.setup.facultiesEmpty', '/v1/university/hierarchy', [col('institution', 'g1.f.institution'), col('code', 'g1.f.code'), col('name', 'ops.f.name'), col('kind', 'g1.f.kind', 'chip', 'g1.v.'), col('dean', 'g1.f.dean'), col('departments', 'g1.col.departments', 'list')], [
      act('add', 'g1.setup.addFaculty', 'POST', '/v1/university/faculties', 'tab', [f('code', 'g1.f.code', { required: true }), f('name', 'ops.f.name', { required: true }), f('kind', 'g1.f.kind', { options: [{ value: 'faculty', label: 'g1.v.faculty' }, { value: 'school', label: 'g1.v.school_unit' }], init: 'faculty' })]),
      act('assign', 'g1.setup.assignDept', 'PUT', '/v1/university/departments/{departmentId}/faculty', 'row', [f('departmentId', 'g1.f.department', { optionsFrom: 'departments', required: true })], { rowBody: { facultyId: 'id' } }),
    ], { shape: 'hierarchy' }),
    tab('frameworks', 'g1.setup.tab.frameworks', 'g1.setup.frameworksEmpty', '/v1/curriculum/frameworks', [col('code', 'g1.f.code'), col('name', 'ops.f.name'), col('kind', 'g1.f.kind', 'chip', 'g1.v.'), col('authority', 'g1.f.authority'), col('regulations', 'g1.col.regulations')], [
      act('add', 'g1.setup.addFramework', 'POST', '/v1/curriculum/frameworks', 'tab', [f('code', 'g1.f.code', { required: true }), f('name', 'ops.f.name', { required: true }), f('kind', 'g1.f.kind', { options: ['national', 'state', 'university', 'institution'].map((v) => ({ value: v, label: `g1.v.${v}` as never })), init: 'national' }), f('authority', 'g1.f.authority'), f('description', 'ops.f.note', { kind: 'multiline' })]),
    ]),
    tab('devices', 'g1.setup.tab.devices', 'g1.setup.devicesEmpty', '/v1/admin/trusted-devices', [col('userName', 'ops.f.name'), col('label', 'g1.f.deviceLabel'), col('platform', 'g1.f.platform'), col('trustedAt', 'g1.col.trusted', 'datetime'), col('lastSeenAt', 'g1.col.lastSeen', 'datetime'), col('revokedAt', 'g1.col.revoked', 'datetime')], [
      act('revoke', 'g1.setup.revoke', 'POST', '/v1/admin/trusted-devices/{id}/revoke', 'row', [], { danger: true, when: { key: 'revokedAt', in: [''] }, confirm: 'g1.setup.revokeConfirm' }),
    ]),
  ],
};

const SECTION_FILTER = { param: 'sectionId', label: 'g1.f.class' as const, from: 'sections' as const };

export const SCHEDULING_DESK: DeskSpec = {
  id: 'scheduling',
  title: 'g1.sched.title',
  subtitle: 'g1.sched.subtitle',
  section: 'scheduling',
  filters: [
    SECTION_FILTER,
    { param: 'by', label: 'g1.f.groupBy', from: 'static', first: true, options: [{ value: 'subject', label: 'g1.v.by_subject' }, { value: 'day', label: 'g1.v.by_day' }, { value: 'month', label: 'g1.v.by_month' }, { value: 'term', label: 'g1.v.by_term' }] },
    { param: 'yearId', label: 'g1.f.year', from: 'years', first: true },
  ],
  tabs: [
    tab('terms', 'g1.sched.tab.terms', 'g1.sched.termsEmpty', '/v1/terms', [col('name', 'ops.f.name'), col('startsOn', 'g1.f.from', 'date'), col('endsOn', 'g1.f.to', 'date')], [
      act('preset', 'g1.sched.makeTerms', 'POST', '/v1/scheduling/term-presets', 'tab', [
        f('academicYearId', 'g1.f.year', { optionsFrom: 'years', required: true }),
        f('preset', 'g1.f.preset', { required: true, options: ['semester', 'trimester', 'quarter', 'annual'].map((v) => ({ value: v, label: `g1.v.${v}` as never })) }),
      ], { showResult: true }),
    ], { hint: 'g1.sched.termsHint' }),
    tab('calendar', 'g1.sched.tab.calendar', 'g1.sched.calendarEmpty', '/v1/calendar', [col('title', 'ops.f.title'), col('kind', 'g1.f.kind', 'chip', 'g1.v.'), col('startsOn', 'g1.f.from', 'date'), col('endsOn', 'g1.f.to', 'date'), col('source', 'g1.col.source', 'chip', 'g1.v.src.')], [
      act('sync', 'g1.sched.sync', 'POST', '/v1/scheduling/calendar/sync', 'tab', [], { confirm: 'g1.sched.syncConfirm', showResult: true }),
      act('scoped', 'g1.sched.addScoped', 'POST', '/v1/admin/calendar', 'tab', [
        f('kind', 'g1.f.kind', { required: true, options: ['holiday', 'exam', 'event'].map((v) => ({ value: v, label: `g1.v.${v}` as never })) }),
        f('title', 'ops.f.title', { required: true }),
        f('startsOn', 'g1.f.from', { kind: 'date', required: true }),
        f('endsOn', 'g1.f.to', { kind: 'date', required: true }),
        f('campusIds', 'g1.f.campus', { optionsFrom: 'campuses', to: 'list' }),
        f('sectionIds', 'g1.f.class', { optionsFrom: 'sections', to: 'list' }),
      ]),
    ], { rows: 'events', hint: 'g1.sched.calendarHint' }),
    tab('frequency', 'g1.sched.tab.frequency', 'g1.sched.frequencyEmpty', '/v1/scheduling/frequency?sectionId={sectionId}', [col('code', 'g1.f.code'), col('name', 'g1.f.subject'), col('rule.minPerWeek', 'g1.f.minWeek'), col('rule.maxPerWeek', 'g1.f.maxWeek'), col('rule.maxPerDay', 'g1.f.maxDay'), col('periods', 'g1.col.periods'), col('status', 'ops.f.status', 'chip', 'g1.v.freq_')], [
      act('generate', 'g1.sched.generate', 'POST', '/v1/scheduling/timetable/generate', 'tab', [
        f('periods', 'g1.f.periods', { kind: 'multiline', to: 'periods', required: true }),
        f('days', 'g1.f.days', { to: 'intlist', init: '1, 2, 3, 4, 5' }),
        f('apply', 'g1.f.saveIt', { to: 'bool', options: YES_NO, init: 'no' }),
        f('replace', 'g1.f.replaceIt', { to: 'bool', options: YES_NO, init: 'no' }),
      ], { filterBody: { sectionId: 'sectionId' }, showResult: true }),
      act('rule', 'g1.sched.setRule', 'PUT', '/v1/scheduling/frequency/{subjectId}', 'row', [f('minPerWeek', 'g1.f.minWeek', { to: 'int', required: true, initFrom: 'rule.minPerWeek' }), f('maxPerWeek', 'g1.f.maxWeek', { to: 'int', required: true, initFrom: 'rule.maxPerWeek' }), f('maxPerDay', 'g1.f.maxDay', { to: 'int', required: true, initFrom: 'rule.maxPerDay' })]),
    ], { needs: ['sectionId'], hint: 'g1.sched.frequencyHint' }),
    tab('rollup', 'g1.sched.tab.rollup', 'g1.sched.rollupEmpty', '/v1/scheduling/attendance/rollup?sectionId={sectionId}&by={by}', [col('label', 'g1.col.group'), col('present', 'g1.col.present'), col('late', 'g1.col.late'), col('absent', 'g1.col.absent'), col('excused', 'g1.col.excused'), col('total', 'g1.col.total'), col('pct', 'g1.col.pct', 'pct')], [], { needs: ['sectionId'], rows: 'groups' }),
    tab('biometric', 'g1.sched.tab.biometric', 'g1.sched.biometricEmpty', '/v1/scheduling/biometric/mappings', [col('fullName', 'ops.f.name'), col('rollNo', 'g1.f.rollNo'), col('deviceUserId', 'g1.f.deviceId')], [
      act('map', 'g1.sched.mapDevices', 'PUT', '/v1/scheduling/biometric/mappings', 'tab', [f('mappings', 'g1.f.mappings', { kind: 'multiline', to: 'idpairs', required: true })]),
      act('import', 'g1.sched.importPunches', 'POST', '/v1/scheduling/biometric/import', 'tab', [f('csv', 'g1.f.csv', { kind: 'multiline', required: true }), f('lateAfter', 'g1.f.lateAfter', { init: '09:30' })], { showResult: true }),
    ], { hint: 'g1.sched.biometricHint' }),
    tab('puc', 'g1.sched.tab.puc', 'g1.sched.pucEmpty', '/v1/scheduling/puc/sections?academicYearId={yearId}', [col('displayName', 'g1.f.class'), col('code', 'g1.f.combination'), col('students', 'g1.col.students')], [
      act('build', 'g1.sched.buildPuc', 'POST', '/v1/scheduling/puc/sections', 'tab', [f('academicYearId', 'g1.f.year', { optionsFrom: 'years', required: true }), f('programId', 'g1.f.programme', { optionsFrom: 'programs', required: true }), f('term', 'g1.f.term', { kind: 'number', to: 'int', required: true })], { showResult: true }),
    ], { needs: ['yearId'], hint: 'g1.sched.pucHint' }),
  ],
};

export const ADMISSIONS_TOOLS_DESK: DeskSpec = {
  id: 'admissionsTools',
  title: 'g1.adm.title',
  subtitle: 'g1.adm.subtitle',
  section: 'admissionsTools',
  filters: [{ param: 'cycleId', label: 'g1.f.cycle', from: 'cycles', first: true }],
  tabs: [
    tab('waitlist', 'g1.adm.tab.waitlist', 'g1.adm.waitlistEmpty', '/v1/admissions/cycles/{cycleId}/waitlist', [col('position', 'g1.col.position'), col('applicationNo', 'g1.f.applicationNo'), col('applicantName', 'ops.f.name'), col('meritRank', 'g1.col.rank'), col('category', 'g1.f.category')], [
      act('promote', 'g1.adm.promote', 'POST', '/v1/admissions/cycles/{cycleId}/waitlist/promote', 'tab', [f('count', 'g1.f.count', { to: 'int' })], { showResult: true }),
    ], { needs: ['cycleId'], rows: 'entries', hint: 'g1.adm.waitlistHint' }),
    tab('landing', 'g1.adm.tab.landing', 'g1.adm.landingEmpty', '/v1/admissions/cycles/{cycleId}/landing', [col('headline', 'g1.f.headline'), col('published', 'g1.col.published', 'bool'), col('highlights', 'g1.col.highlights', 'count'), col('faqs', 'g1.col.faqs', 'count'), col('contactPhone', 'ops.f.phone')], [
      act('edit', 'g1.adm.editLanding', 'PUT', '/v1/admissions/cycles/{cycleId}/landing', 'row', [
        f('headline', 'g1.f.headline', { required: true, initFrom: 'headline' }),
        f('intro', 'g1.f.intro', { kind: 'multiline', initFrom: 'intro' }),
        f('highlights', 'g1.f.highlights', { kind: 'multiline', to: 'blocks', initFrom: 'highlights' }),
        f('faqs', 'g1.f.faqs', { kind: 'multiline', to: 'faqs', initFrom: 'faqs' }),
        f('contactPhone', 'ops.f.phone', { initFrom: 'contactPhone' }),
        f('contactEmail', 'g1.f.email', { initFrom: 'contactEmail' }),
        f('published', 'g1.col.published', { to: 'bool', options: YES_NO, initFrom: 'published' }),
      ]),
    ], { needs: ['cycleId'], shape: 'single', hint: 'g1.adm.landingHint' }),
    tab('duplicates', 'g1.adm.tab.duplicates', 'g1.adm.checkEmpty', '', [], [
      act('check', 'g1.adm.checkDuplicates', 'GET', '/v1/admissions/applications/{applicationId}/duplicates', 'tab', [f('applicationId', 'g1.f.applicationId', { kind: 'uuid', required: true })], { showResult: true }),
    ], { hint: 'g1.adm.duplicatesHint' }),
    tab('corrections', 'g1.adm.tab.corrections', 'g1.adm.checkEmpty', '', [], [
      act('ask', 'g1.adm.askCorrection', 'POST', '/v1/admissions/applications/{applicationId}/request-correction', 'tab', [f('applicationId', 'g1.f.applicationId', { kind: 'uuid', required: true }), f('notes', 'g1.f.correctionNotes', { kind: 'multiline', required: true }), f('items', 'g1.f.correctionItems', { to: 'list' }), f('dueOn', 'g1.f.dueOn', { kind: 'date' })], { showResult: true }),
    ], { hint: 'g1.adm.correctionsHint' }),
    tab('prior', 'g1.adm.tab.prior', 'g1.adm.checkEmpty', '', [], [
      act('addApp', 'g1.adm.addPriorApp', 'POST', '/v1/admissions/applications/{applicationId}/prior-education', 'tab', [f('applicationId', 'g1.f.applicationId', { kind: 'uuid', required: true }), ...priorFields()]),
      act('addStudent', 'g1.adm.addPriorStudent', 'POST', '/v1/admissions/students/{studentId}/prior-education', 'tab', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true }), ...priorFields()]),
      act('viewStudent', 'g1.adm.viewPrior', 'GET', '/v1/admissions/students/{studentId}/prior-education', 'tab', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true })], { showResult: true }),
    ], { hint: 'g1.adm.priorHint' }),
  ],
};

function priorFields(): DeskField[] {
  return [
    f('level', 'g1.f.level', { required: true, options: ['primary', 'secondary', 'puc', 'ug', 'pg', 'other'].map((v) => ({ value: v, label: `g1.v.level.${v}` as never })), init: 'secondary' }),
    f('institution', 'g1.f.institution', { required: true }),
    f('board', 'g1.f.board'),
    f('passingYear', 'g1.f.passingYear', { to: 'int' }),
    f('percentage', 'g1.f.percentage', { to: 'num' }),
    f('tcNumber', 'g1.f.tcNumber'),
  ];
}

export const LEARNING_DESK: DeskSpec = {
  id: 'learningSupport',
  title: 'g1.learn.title',
  subtitle: 'g1.learn.subtitle',
  section: 'learningSupport',
  filters: [SECTION_FILTER, { param: 'yearId', label: 'g1.f.year', from: 'years', first: true }, { param: 'courseId', label: 'g1.f.course', from: 'courses' }],
  tabs: [
    tab('worksheets', 'g1.learn.tab.worksheets', 'g1.learn.worksheetsEmpty', '/v1/school-learning/worksheets?sectionId={sectionId}', [col('title', 'ops.f.title'), col('kind', 'g1.f.kind', 'chip', 'g1.v.ws_'), col('subjectName', 'g1.f.subject'), col('section', 'g1.f.class'), col('dueOn', 'g1.f.dueOn', 'date'), col('maxScore', 'g1.f.maxScore'), col('scored', 'g1.col.scored')], [
      act('add', 'g1.learn.addWorksheet', 'POST', '/v1/school-learning/worksheets', 'tab', [
        f('kind', 'g1.f.kind', { options: ['worksheet', 'reading', 'remedial', 'phonics', 'numeracy', 'activity', 'board_prep'].map((v) => ({ value: v, label: `g1.v.ws_${v}` as never })), init: 'worksheet' }),
        f('title', 'ops.f.title', { required: true }),
        f('sectionId', 'g1.f.class', { optionsFrom: 'sections', required: true }),
        f('subjectName', 'g1.f.subject', { required: true }),
        f('instructions', 'g1.f.instructions', { kind: 'multiline' }),
        f('dueOn', 'g1.f.dueOn', { kind: 'date' }),
        f('maxScore', 'g1.f.maxScore', { to: 'num' }),
        f('levels', 'g1.f.levels', { to: 'list' }),
        f('outcomeId', 'g1.f.outcomeId', { kind: 'uuid' }),
      ]),
      act('roster', 'g1.learn.roster', 'GET', '/v1/school-learning/worksheets/{id}', 'row', [], { showResult: true }),
      act('score', 'g1.learn.score', 'PUT', '/v1/school-learning/worksheets/{id}/scores', 'row', [f('scores', 'g1.f.scores', { kind: 'multiline', to: 'scorelines', required: true })], { showResult: true }),
    ], { hint: 'g1.learn.worksheetsHint' }),
    tab('mastery', 'g1.learn.tab.mastery', 'g1.learn.masteryEmpty', '/v1/school-learning/outcome-tree', [col('code', 'g1.f.code'), col('subjectName', 'g1.f.subject'), col('statement', 'g1.f.statement'), col('topics', 'g1.col.topics', 'count'), col('mastery.mastery', 'g1.v.mastery'), col('mastery.proficient', 'g1.v.proficient'), col('mastery.developing', 'g1.v.developing'), col('mastery.beginning', 'g1.v.beginning')], [
      act('link', 'g1.learn.linkTopics', 'PUT', '/v1/school-learning/outcomes/{id}/topics', 'row', [f('topicIds', 'g1.f.topicIds', { to: 'list', required: true })]),
    ]),
    tab('remedial', 'g1.learn.tab.remedial', 'g1.learn.remedialEmpty', '/v1/school-learning/remedial?sectionId={sectionId}', [col('studentName', 'ops.f.student'), col('subjectName', 'g1.f.subject'), col('source', 'g1.col.source', 'chip', 'g1.v.rem_'), col('plan', 'g1.f.plan'), col('dueOn', 'g1.f.dueOn', 'date'), col('status', 'ops.f.status', 'chip', 'g1.v.rs_')], [
      act('generate', 'g1.learn.generate', 'POST', '/v1/school-learning/remedial/generate', 'tab', [f('upTo', 'g1.f.upTo', { options: [{ value: 'developing', label: 'g1.v.developing' }, { value: 'beginning', label: 'g1.v.beginning' }], init: 'developing' })], { filterBody: { sectionId: 'sectionId' }, showResult: true, confirm: 'g1.learn.generateConfirm' }),
      act('delayed', 'g1.learn.delayed', 'POST', '/v1/school-learning/delayed-topics/remediate', 'tab', [], { filterBody: { sectionId: 'sectionId' }, showResult: true, confirm: 'g1.learn.delayedConfirm' }),
      act('update', 'common.edit', 'PUT', '/v1/school-learning/remedial/{id}', 'row', [f('status', 'ops.f.status', { options: [{ value: 'open', label: 'g1.v.rs_open' }, { value: 'in_progress', label: 'g1.v.rs_in_progress' }, { value: 'closed', label: 'g1.v.rs_closed' }], initFrom: 'status' }), f('resultNote', 'g1.f.result', { kind: 'multiline' })]),
    ], { hint: 'g1.learn.remedialHint' }),
    tab('readiness', 'g1.learn.tab.readiness', 'g1.learn.readinessEmpty', '/v1/school-learning/readiness/sections/{sectionId}', [col('fullName', 'ops.f.student'), col('exam', 'g1.f.exam'), col('targetPct', 'g1.f.target', 'pct'), col('latestPct', 'g1.col.latest', 'pct'), col('averagePct', 'g1.col.average', 'pct'), col('band', 'ops.f.status', 'chip', 'g1.v.band_'), col('trend', 'g1.col.trend', 'chip', 'g1.v.trend_'), col('weakSubjects', 'g1.col.weak', 'list')], [
      act('target', 'g1.learn.setTarget', 'PUT', '/v1/school-learning/readiness/targets', 'tab', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true }), f('exam', 'g1.f.exam', { required: true }), f('examOn', 'g1.f.examOn', { kind: 'date' }), f('targetPct', 'g1.f.target', { to: 'num' })]),
      act('mock', 'g1.learn.addMock', 'POST', '/v1/school-learning/readiness/mocks', 'tab', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true }), f('exam', 'g1.f.exam', { required: true }), f('takenOn', 'g1.f.takenOn', { kind: 'date', required: true }), f('score', 'g1.f.score', { to: 'num', required: true }), f('maxScore', 'g1.f.maxScore', { to: 'num', required: true }), f('breakdown', 'g1.f.breakdown', { kind: 'multiline', to: 'numpairs' })]),
    ], { needs: ['sectionId'], hint: 'g1.learn.readinessHint' }),
    tab('promotion', 'g1.learn.tab.promotion', 'g1.learn.promotionEmpty', '/v1/school-learning/promotion/decisions?academicYearId={yearId}&sectionId={sectionId}', [col('fullName', 'ops.f.student'), col('section', 'g1.f.class'), col('decision', 'g1.col.decision', 'chip', 'g1.v.dec_'), col('attendancePct', 'g1.col.attendance', 'pct'), col('reasons', 'g1.col.reasons', 'list'), col('status', 'ops.f.status', 'chip', 'g1.v.ds_')], [
      act('evaluate', 'g1.learn.evaluate', 'POST', '/v1/school-learning/promotion/evaluate', 'tab', [f('academicYearId', 'g1.f.year', { optionsFrom: 'years', required: true }), f('sectionId', 'g1.f.class', { optionsFrom: 'sections', required: true })], { showResult: true }),
      act('approve', 'g1.learn.approve', 'POST', '/v1/school-learning/promotion/decisions/approve', 'row', [], { rowBody: { ids: '[id]' }, fixed: { decision: 'approved' }, when: { key: 'status', in: ['pending'] }, confirm: 'g1.learn.approveConfirm', showResult: true }),
      act('reject', 'g1.learn.reject', 'POST', '/v1/school-learning/promotion/decisions/approve', 'row', [], { rowBody: { ids: '[id]' }, fixed: { decision: 'rejected' }, danger: true, when: { key: 'status', in: ['pending'] } }),
    ], { needs: ['yearId'], hint: 'g1.learn.promotionHint' }),
    tab('rules', 'g1.learn.tab.rules', 'g1.learn.rulesEmpty', '/v1/school-learning/promotion/rules', [col('name', 'ops.f.name'), col('minAttendancePct', 'g1.f.minAttendance', 'pct'), col('subjectPassPct', 'g1.f.subjectPass', 'pct'), col('maxCompartmentSubjects', 'g1.f.compartment'), col('graceMarks', 'g1.f.grace'), col('isDefault', 'g1.col.default', 'bool')], [
      act('add', 'g1.learn.addRule', 'POST', '/v1/school-learning/promotion/rules', 'tab', [f('name', 'ops.f.name', { required: true }), f('minAttendancePct', 'g1.f.minAttendance', { to: 'int' }), f('subjectPassPct', 'g1.f.subjectPass', { to: 'int' }), f('maxCompartmentSubjects', 'g1.f.compartment', { to: 'int' }), f('graceMarks', 'g1.f.grace', { to: 'int' }), f('isDefault', 'g1.col.default', { to: 'bool', options: YES_NO })]),
    ]),
    tab('boardResult', 'g1.learn.tab.boardResult', 'g1.adm.checkEmpty', '', [], [
      act('check', 'g1.learn.boardResult', 'GET', '/v1/school-learning/boards/results/students/{studentId}?academicYearId={yearId}', 'tab', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true })], { showResult: true }),
    ], { hint: 'g1.learn.boardResultHint' }),
    tab('forum', 'g1.learn.tab.forum', 'g1.learn.forumEmpty', '/v1/lms/courses/{courseId}/forum', [col('title', 'ops.f.title'), col('author', 'g1.col.author'), col('replies', 'g1.col.replies'), col('pinned', 'g1.col.pinned', 'bool'), col('locked', 'g1.col.locked', 'bool'), col('hidden', 'g1.col.hidden', 'bool'), col('lastPostAt', 'g1.col.lastPost', 'datetime')], [
      act('clone', 'g1.learn.clone', 'POST', '/v1/lms/courses/{courseId}/clone', 'tab', [f('sectionId', 'g1.f.class', { optionsFrom: 'sections', required: true }), f('title', 'ops.f.title')], { showResult: true }),
      act('pin', 'g1.learn.pin', 'POST', '/v1/lms/forum/{id}/moderate', 'row', [], { fixed: { action: 'pin' }, when: { key: 'pinned', in: ['false'] } }),
      act('lock', 'g1.learn.lock', 'POST', '/v1/lms/forum/{id}/moderate', 'row', [], { fixed: { action: 'lock' }, when: { key: 'locked', in: ['false'] } }),
      act('unlock', 'g1.learn.unlock', 'POST', '/v1/lms/forum/{id}/moderate', 'row', [], { fixed: { action: 'unlock' }, when: { key: 'locked', in: ['true'] } }),
      act('hide', 'g1.learn.hide', 'POST', '/v1/lms/forum/{id}/moderate', 'row', [], { fixed: { action: 'hide' }, danger: true, when: { key: 'hidden', in: ['false'] } }),
      act('unhide', 'g1.learn.unhide', 'POST', '/v1/lms/forum/{id}/moderate', 'row', [], { fixed: { action: 'unhide' }, when: { key: 'hidden', in: ['true'] } }),
    ], { needs: ['courseId'], hint: 'g1.learn.forumHint' }),
  ],
};

export const ASSESSMENT_DESK: DeskSpec = {
  id: 'assessmentTools',
  title: 'g1.assess.title',
  subtitle: 'g1.assess.subtitle',
  section: 'assessmentTools',
  filters: [],
  tabs: [
    tab('rubrics', 'g1.assess.tab.rubrics', 'g1.assess.rubricsEmpty', '/v1/assessment-tools/rubrics', [col('name', 'ops.f.name'), col('scope', 'g1.f.scope', 'chip', 'g1.v.scope_'), col('criteria', 'g1.col.criteria', 'count'), col('maxPoints', 'g1.col.maxPoints')], [
      act('add', 'g1.assess.addRubric', 'POST', '/v1/assessment-tools/rubrics', 'tab', [f('name', 'ops.f.name', { required: true }), f('scope', 'g1.f.scope', { options: ['general', 'practical', 'project', 'viva', 'activity', 'essay'].map((v) => ({ value: v, label: `g1.v.scope_${v}` as never })), init: 'general' }), f('criteria', 'g1.f.criteria', { kind: 'multiline', to: 'rubric', required: true })]),
      act('score', 'g1.assess.scoreRubric', 'POST', '/v1/assessment-tools/rubrics/{id}/score', 'row', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true }), f('selections', 'g1.f.selections', { to: 'intlist', required: true })], { showResult: true }),
      act('archive', 'g1.assess.archive', 'POST', '/v1/assessment-tools/rubrics/{id}/archive', 'row', [], { danger: true, confirm: 'g1.assess.archiveConfirm' }),
    ], { hint: 'g1.assess.rubricsHint' }),
    tab('reattempts', 'g1.assess.tab.reattempts', 'g1.assess.reattemptsEmpty', '/v1/assessment-tools/reattempts', [col('fullName', 'ops.f.student'), col('subject', 'g1.f.subject'), col('scheme', 'g1.f.assessment'), col('attemptNo', 'g1.col.attempt'), col('reason', 'g1.f.reason'), col('status', 'ops.f.status', 'chip', 'ops.st.')], [
      act('approve', 'g1.assess.approve', 'POST', '/v1/assessment-tools/reattempts/{id}/decide', 'row', [f('note', 'ops.f.note')], { fixed: { decision: 'approved' }, when: { key: 'status', in: ['pending'] } }),
      act('reject', 'g1.assess.reject', 'POST', '/v1/assessment-tools/reattempts/{id}/decide', 'row', [f('note', 'ops.f.note')], { fixed: { decision: 'rejected' }, danger: true, when: { key: 'status', in: ['pending'] } }),
    ]),
    tab('integrity', 'g1.assess.tab.integrity', 'g1.assess.integrityEmpty', '/v1/assessment-tools/integrity/flags', [col('fullName', 'ops.f.student'), col('contextKind', 'g1.col.context'), col('kind', 'g1.f.kind', 'chip', 'g1.v.ik_'), col('severity', 'g1.col.severity', 'chip', 'g1.v.sev_'), col('createdAt', 'g1.col.when', 'datetime'), col('status', 'ops.f.status', 'chip', 'g1.v.is_')], [
      act('flag', 'g1.assess.flag', 'POST', '/v1/assessment-tools/integrity/flags', 'tab', [f('studentId', 'g1.f.studentId', { kind: 'uuid', required: true }), f('contextKind', 'g1.col.context', { required: true }), f('severity', 'g1.col.severity', { options: ['low', 'medium', 'high'].map((v) => ({ value: v, label: `g1.v.sev_${v}` as never })), init: 'medium' }), f('details', 'g1.f.details', { kind: 'multiline', to: 'pairs' })]),
      act('confirm', 'g1.assess.confirm', 'POST', '/v1/assessment-tools/integrity/flags/{id}/review', 'row', [f('note', 'ops.f.note', { required: true })], { fixed: { status: 'confirmed' }, danger: true, when: { key: 'status', in: ['open'] } }),
      act('dismiss', 'g1.assess.dismiss', 'POST', '/v1/assessment-tools/integrity/flags/{id}/review', 'row', [f('note', 'ops.f.note', { required: true })], { fixed: { status: 'dismissed' }, when: { key: 'status', in: ['open'] } }),
    ], { hint: 'g1.assess.integrityHint' }),
  ],
};

export const DESKS = { setup: SETUP_DESK, scheduling: SCHEDULING_DESK, admissionsTools: ADMISSIONS_TOOLS_DESK, learningSupport: LEARNING_DESK, assessmentTools: ASSESSMENT_DESK } as const;
