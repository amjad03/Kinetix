// Builds the Zynetix ERP entity-relationship docs from the live Drizzle schema in services/api/src/db.
// Run: node scripts/er/generate.mjs
// Writes docs/architecture/er/{er-data.json,index.html,zynetix-er-overview.svg} and docs/architecture/ER.md.
import { register } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbDir = join(root, 'services/api/src/db');
const outDir = join(root, 'docs/architecture/er');
register(pathToFileURL(join(root, 'scripts/er/ts-resolve.mjs')));

const { getTableConfig, PgTable } = await import(pathToFileURL(join(root, 'services/api/node_modules/drizzle-orm/pg-core/index.js')));
const { is } = await import(pathToFileURL(join(root, 'services/api/node_modules/drizzle-orm/index.js')));

const files = readdirSync(dbDir).filter((f) => /^schema(-[\w-]+)?\.ts$/.test(f)).sort();
const fileLabel = (f) =>
  f === 'schema.ts' ? 'Core' : f.replace(/^schema-|\.ts$/g, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// Section headers ("// ----" / "// Title" / "// ----") group the tables of a file into modules.
const sectionOf = new Map();
for (const f of files) {
  const lines = readFileSync(join(dbDir, f), 'utf8').split('\n');
  let section = fileLabel(f);
  for (let i = 0; i < lines.length; i++) {
    if (/^\/\/ -{20,}/.test(lines[i]) && /^\/\/ \S/.test(lines[i + 1] ?? '') && /^\/\/ -{20,}/.test(lines[i + 2] ?? '')) {
      section = lines[i + 1].slice(3).trim();
      i += 2;
      continue;
    }
    const m = /^export const (\w+) = pgTable\(/.exec(lines[i]);
    if (m) sectionOf.set(`${f}:${m[1]}`, section);
  }
}

// Business domains, matched in order on the table name; the schema section stays on each table as `section`.
const DOMAINS = [
  ['Workflow & approvals', /^(workflow_|approval_delegations|business_rules|tasks$)/],
  ['AI', /^(ai_|content_embeddings|career_assistant)/],
  ['Smartboard & devices', /^(devices|device_|board_sessions|pairing_codes|cast_sessions|whiteboard|model_requests|access_devices|sync_ops)/],
  ['Integrations, migration & reports', /^(integration_|connector|migration_|legacy_|custom_reports|report_runs|report_schedules|dl_documents|lti_|scorm_|tally_|api_tokens)/],
  ['Platform, identity & compliance', /^(tenants|users|user_|campuses|platform_admins|otp_codes|sso_|trusted_devices|tenant_|feature_flags|audit_log|domain_events|event_consumptions|upload_scans|saas_|institution_profiles|module_settings|jobs$|dpdp_|document_retention|data_retention|retention_rules|consents|credential_tags)/],
  ['OBE & accreditation (NBA/NAAC)', /^(course_outcomes|program_outcomes|co_|assessment_co_map|attainment_|improvement_actions|obe_|poll_co_map|accreditation_|dvv_|faculty_evidence|iqac_|academic_audit|audit_template|audit_non|sdg_|impact_|outcome_passports|committee_evidence)/],
  ['Admissions & CRM', /^(enquir|admission_|application|entrance_|merit_lists|lead_|agent_|interview_scores)/],
  ['Exams, evaluation & results', /^(exam_|eval_|hall_tickets|invigilation|malpractice|revaluation|reattempt|supplementary|grace_awards|grade_|assessment_schemes|scheme_components|assessments$|marks$|mark_normalisations|tabulation|university_templates|result_class|ext_|qb_|past_exam|report_card|co_curricular|integrity_|similarity_checks|readiness_|remedial_plans)/],
  ['Fees, finance & accounts', /^(fee_|payment_gateway|receipt_counters|bank_transfer|sponsor|settlement_|refund_requests|scholarship_|budgets|cost_expenses|acct_|tds_challans)/],
  ['HR & payroll', /^(staff_|designations|job_|leave_|hr_settings|service_book|appraisal|payroll_|payslips|salary_|training_|separations|onboarding_items|exit_clearances|probation|teaching_evaluations|offer_letters)/],
  ['Placements, internships & alumni', /^(placement_|drive_|round_results|internship|alumni_|career_|student_resumes|mock_interviews|aptitude_|portfolio_items)/],
  ['Research & projects', /^(research_|publications|patents|conferences|grant_|project_|thesis_|supervisor_)/],
  ['Student support & activities', /^(mentor|counselling|discipline_|grievance_|welfare_|intervention_|early_alert|club|committee|campus_events|event_)/],
  ['School life (K-12)', /^(ey_|diary_|ptm_|health_|house|puc_)/],
  ['Campus operations', /^(hostel_|mess_|canteen_|transport_|incident|amc_|student_leave_requests)/],
  ['Inventory & assets', /^(inv_|asset)/],
  ['Library & LMS', /^(library_|lms_|content_licenses|forum_|recordings|lesson_recording|concept_videos)/],
  ['Communication', /^(chat_|broadcast|notifications|push_devices|messages|conversations|message_|audience_rules|survey)/],
  ['Classroom & attendance', /^(attendance_|exit_tickets|participation_|polls|poll_|quiz_|answer_cards|buzzer_|badges|class_notes|class_meetings|meeting_attendance|homework|worksheet|mastery_|rubric|timetable_|teacher_substitutions)/],
  ['Curriculum & teaching plans', /^(regulations|curriculum|curricula|syllabus_|chapters|topics|courses$|learning_outcomes|topic_coverage|year_plan|lesson_plan|outcome_topics|resource_topic|student_curriculum_pins|affiliated_institutions|skill|course_files|subject_frequency)/],
  ['Student records & certificates', /^(students|guardians|student_|promotion_|parent_visibility|convocation|certificate|vault_documents|academic_doc_requests|doc_counters)/],
  ['Academic structure', /^(academic_|buildings|building_floors|rooms|departments|department_staff|programs|sections|subjects|faculties|campus_settings|school_boards|course_offerings|course_registrations|registration_windows|calendar_events)/],
];
const domainOf = (name) => DOMAINS.find(([, re]) => re.test(name))?.[0];

const tables = new Map();
for (const f of files) {
  const mod = await import(pathToFileURL(join(dbDir, f)));
  for (const [exportName, value] of Object.entries(mod)) {
    if (!is(value, PgTable)) continue;
    const c = getTableConfig(value);
    if (tables.has(c.name)) continue;
    const pk = new Set(c.primaryKeys.flatMap((p) => p.columns.map((col) => col.name)));
    const fks = c.foreignKeys.map((fk) => {
      const r = fk.reference();
      return { columns: r.columns.map((col) => col.name), table: getTableConfig(r.foreignTable).name, onDelete: fk.onDelete ?? 'no action' };
    });
    const fkCols = new Set(fks.flatMap((fk) => fk.columns));
    const uniques = [
      ...c.indexes.filter((ix) => ix.config.unique).map((ix) => ix.config.columns.map((col) => col.name ?? '?')),
      ...c.uniqueConstraints.map((u) => u.columns.map((col) => col.name)),
    ];
    tables.set(c.name, {
      name: c.name,
      exportName,
      file: f,
      section: sectionOf.get(`${f}:${exportName}`) ?? fileLabel(f),
      module: domainOf(c.name) ?? 'Other',
      columns: c.columns.map((col) => ({
        name: col.name,
        type: col.getSQLType(),
        nullable: !col.notNull,
        pk: col.primary || pk.has(col.name),
        fk: fkCols.has(col.name),
        unique: col.isUnique,
      })),
      fks,
      uniques,
    });
  }
}

const list = [...tables.values()].sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
const modules = [...new Set(list.map((t) => t.module))];
// tenant_id → tenants is on almost every table; it is counted but left out of the diagrams to keep them readable.
const relations = list.flatMap((t) => t.fks.map((fk) => ({ from: t.name, to: fk.table, columns: fk.columns, onDelete: fk.onDelete })));
const data = {
  generatedAt: new Date().toISOString(),
  counts: { tables: list.length, columns: list.reduce((s, t) => s + t.columns.length, 0), relations: relations.length, modules: modules.length },
  modules: modules.map((m) => ({ name: m, tables: list.filter((t) => t.module === m).map((t) => t.name) })),
  tables: list,
  relations,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'er-data.json'), JSON.stringify(data, null, 1));

// --- Mermaid per module -------------------------------------------------------------------------
const moduleOf = new Map(list.map((t) => [t.name, t.module]));
const mmType = (t) => t.replace(/\(.*\)/, '').replace(/\s+/g, '_').replace(/\[\]/g, '_array');
let md = `# Zynetix ERP — entity-relationship model\n\nGenerated from the Drizzle schema (\`services/api/src/db/schema*.ts\`) by \`node scripts/er/generate.mjs\`; do not edit by hand.\n\n`;
md += `**${data.counts.tables} tables, ${data.counts.columns} columns, ${data.counts.relations} foreign keys, ${data.counts.modules} modules.** `;
md += `Interactive explorer: [er/index.html](er/index.html). Poster: [er/zynetix-er-overview.png](er/zynetix-er-overview.png) / [.pdf](er/zynetix-er-overview.pdf).\n\n`;
md += `Every tenant-owned table carries \`tenant_id → tenants\` (cascade); those links are omitted from the diagrams below. Tables from other modules appear as bare boxes.\n\n## Modules\n\n`;
md += `| Module | Tables | FKs out | FKs from other modules |\n|---|---:|---:|---:|\n`;
for (const m of data.modules) {
  const out = relations.filter((r) => moduleOf.get(r.from) === m.name && r.to !== 'tenants').length;
  const inn = relations.filter((r) => moduleOf.get(r.to) === m.name && moduleOf.get(r.from) !== m.name && r.to !== 'tenants').length;
  md += `| [${m.name}](#${m.name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')}) | ${m.tables.length} | ${out} | ${inn} |\n`;
}
for (const m of data.modules) {
  md += `\n## ${m.name}\n\n\`\`\`mermaid\nerDiagram\n`;
  const own = new Set(m.tables);
  for (const name of m.tables) {
    const t = tables.get(name);
    md += `  ${name} {\n`;
    for (const col of t.columns) {
      const key = [col.pk && 'PK', col.fk && 'FK', !col.pk && col.unique && 'UK'].filter(Boolean).join(',');
      md += `    ${mmType(col.type)} ${col.name}${key ? ' ' + key : ''}\n`;
    }
    md += `  }\n`;
  }
  const seen = new Set();
  for (const r of relations) {
    if (r.to === 'tenants' || !(own.has(r.from) || own.has(r.to))) continue;
    if (!own.has(r.from) && moduleOf.get(r.from) !== m.name) continue; // inbound edges are drawn in the source module
    const key = `${r.to}|${r.from}|${r.columns.join()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nullable = r.columns.some((c) => tables.get(r.from).columns.find((x) => x.name === c)?.nullable);
    md += `  ${r.to} ||--o{ ${r.from} : "${r.columns.join(', ')}${nullable ? ' (optional)' : ''}"\n`;
  }
  md += '```\n';
}
writeFileSync(join(root, 'docs/architecture/ER.md'), md);

// --- Overview poster (every table, grouped by domain, in balanced columns) -----------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const hue = (i) => Math.round((i * 360) / modules.length);
const NCOL = 6, colW = 300, gap = 24, pad = 48, top = 140, rowH = 17, headH = 52;
const colY = Array(NCOL).fill(top);
let boxes = '';
data.modules
  .map((m, i) => ({ ...m, i }))
  .sort((a, b) => b.tables.length - a.tables.length)
  .forEach((m) => {
    const c = colY.indexOf(Math.min(...colY));
    const x = pad + c * (colW + gap), y = colY[c], h = headH + m.tables.length * rowH + 12;
    const own = new Set(m.tables);
    const out = relations.filter((r) => own.has(r.from) && !own.has(r.to) && r.to !== 'tenants').length;
    boxes += `<g><rect x="${x}" y="${y}" width="${colW}" height="${h}" rx="10" fill="hsl(${hue(m.i)} 70% 97%)" stroke="hsl(${hue(m.i)} 55% 45%)" stroke-width="1.5"/>`;
    boxes += `<rect x="${x}" y="${y}" width="${colW}" height="${headH - 8}" rx="10" fill="hsl(${hue(m.i)} 60% 90%)"/>`;
    boxes += `<text x="${x + 12}" y="${y + 20}" font-size="14" font-weight="700" fill="#0f172a">${esc(m.name)}</text>`;
    boxes += `<text x="${x + 12}" y="${y + 37}" font-size="11" fill="#475569">${m.tables.length} tables · ${out} links to other domains</text>`;
    m.tables.forEach((t, k) => {
      const tt = tables.get(t);
      boxes += `<text x="${x + 12}" y="${y + headH + 8 + k * rowH}" font-size="11.5" font-family="ui-monospace, Menlo, monospace" fill="#1e293b">${esc(t)}<tspan fill="#94a3b8"> ${tt.columns.length}c${tt.fks.length ? ' · ' + tt.fks.length + 'fk' : ''}</tspan></text>`;
    });
    boxes += '</g>\n';
    colY[c] = y + h + gap;
  });
const W = pad * 2 + NCOL * colW + (NCOL - 1) * gap, H = Math.max(...colY) + 20;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, -apple-system, Segoe UI, sans-serif">\n<rect width="100%" height="100%" fill="#ffffff"/>\n`;
svg += `<text x="${pad}" y="66" font-size="30" font-weight="700" fill="#0f172a">Zynetix ERP — entity-relationship overview</text>\n`;
svg += `<text x="${pad}" y="100" font-size="15" fill="#475569">${data.counts.tables} tables · ${data.counts.columns} columns · ${data.counts.relations} foreign keys · ${data.counts.modules} domains. Each row: table, column count (c), foreign keys (fk). Every tenant table also links to tenants. Generated ${data.generatedAt.slice(0, 10)}; full detail in docs/architecture/er/index.html.</text>\n`;
svg += boxes + '</svg>\n';
writeFileSync(join(outDir, 'zynetix-er-overview.svg'), svg);

// --- Interactive explorer -------------------------------------------------------------------------
const tpl = readFileSync(join(root, 'scripts/er/explorer.html'), 'utf8');
writeFileSync(join(outDir, 'index.html'), tpl.replace('/*__ER_DATA__*/null', JSON.stringify(data)));

console.log(`tables ${data.counts.tables}, columns ${data.counts.columns}, relations ${data.counts.relations}, modules ${data.counts.modules}`);
