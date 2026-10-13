// Three editable builder workflows for the demo institutions: leave approval, fee concession and certificate request.
import { compileGraph, type BuilderGraph, type WorkflowModule } from './builder-graph.js';
import type { FormField } from './workflow-rules.js';

export interface BuilderSeed {
  requestType: string;
  name: string;
  description: string;
  module: WorkflowModule;
  fields: FormField[];
  graph: BuilderGraph;
}

export const BUILDER_SEEDS: BuilderSeed[] = [
  {
    requestType: 'leave_approval',
    name: 'Staff leave approval',
    description: 'Leave of more than three days goes to the principal after the head of department.',
    module: 'hr',
    fields: [
      { key: 'days', label: 'Number of days', type: 'number', required: true },
      { key: 'reason', label: 'Reason', type: 'text', required: true },
    ],
    graph: {
      trigger: { id: 'trigger', type: 'trigger', name: 'Leave request submitted', sources: ['staff_desk'] },
      nodes: [
        { id: 'a1', type: 'approval', name: 'Head of department', approver: { kind: 'department_head' }, slaHours: 24, reminderHours: 12, escalateTo: { kind: 'role', role: 'principal' } },
        { id: 'c1', type: 'condition', name: 'More than 3 days?', field: 'days', op: '>', value: 3, yes: [{ id: 'a2', type: 'approval', name: 'Principal approval', approver: { kind: 'role', role: 'principal' }, slaHours: 48, escalateTo: null, reminderHours: null }], no: [] },
        { id: 'n1', type: 'notify', name: 'Tell the staff member', channels: ['app', 'email'], template: 'decision', when: 'decided', to: 'requester' },
      ],
    },
  },
  {
    requestType: 'fee_concession',
    name: 'Fee concession approval',
    description: 'Concessions above Rs 25,000 need the head of department and the principal; smaller ones the accounts officer.',
    module: 'fees',
    fields: [
      { key: 'student', label: 'Student name', type: 'text', required: true },
      { key: 'basis', label: 'Basis', type: 'select', required: true, options: ['Merit', 'Sibling', 'Financial need', 'Staff ward'] },
    ],
    graph: {
      trigger: { id: 'trigger', type: 'trigger', name: 'Concession request submitted', sources: ['parent_app', 'office_counter'] },
      nodes: [
        { id: 'n0', type: 'notify', name: 'Acknowledge the request', channels: ['app', 'sms'], template: 'request_received', when: 'submitted', to: 'requester' },
        {
          id: 'c1',
          type: 'condition',
          name: 'Amount above Rs 25,000?',
          field: 'amount',
          op: '>',
          value: 25000,
          yes: [
            { id: 'a1', type: 'approval', name: 'HOD review', approver: { kind: 'department_head' }, slaHours: 48, escalateTo: { kind: 'role', role: 'principal' }, reminderHours: 24 },
            { id: 'a2', type: 'approval', name: 'Principal approval', approver: { kind: 'role', role: 'principal' }, slaHours: 72, escalateTo: null, reminderHours: null },
          ],
          no: [{ id: 'a3', type: 'approval', name: 'Accounts officer review', approver: { kind: 'role', role: 'accountant' }, slaHours: 24, escalateTo: null, reminderHours: null }],
        },
        { id: 'n1', type: 'notify', name: 'Notify parent and student', channels: ['sms', 'app'], template: 'decision', when: 'decided', to: 'requester' },
      ],
    },
  },
  {
    requestType: 'certificate_request',
    name: 'Certificate request',
    description: 'Bonafide, conduct and transfer certificates: the office checks the record and the principal signs.',
    module: 'certificates',
    fields: [
      { key: 'certificate', label: 'Certificate', type: 'select', required: true, options: ['Bonafide', 'Conduct', 'Transfer', 'Study'] },
      { key: 'purpose', label: 'Purpose', type: 'text', required: false },
    ],
    graph: {
      trigger: { id: 'trigger', type: 'trigger', name: 'Certificate requested', sources: ['student_portal', 'parent_app', 'office_counter'] },
      nodes: [
        { id: 'a1', type: 'approval', name: 'Office verification', approver: { kind: 'role', role: 'admissions_officer' }, slaHours: 24, escalateTo: null, reminderHours: null },
        { id: 'c1', type: 'condition', name: 'Transfer certificate?', field: 'certificate', op: '==', value: 'Transfer', yes: [{ id: 'a2', type: 'approval', name: 'Fee clearance', approver: { kind: 'role', role: 'accountant' }, slaHours: 24, escalateTo: null, reminderHours: null }], no: [] },
        { id: 'a3', type: 'approval', name: 'Principal signature', approver: { kind: 'role', role: 'principal' }, slaHours: 48, escalateTo: null, reminderHours: null },
        { id: 'n1', type: 'notify', name: 'Certificate ready', channels: ['app', 'sms'], template: 'approved', when: 'approved', to: 'requester' },
      ],
    },
  },
];

/** Row values for `workflow_definitions` (without tenant and author). */
export const builderSeedRows = () =>
  BUILDER_SEEDS.map((s) => {
    const { steps, notifyRules } = compileGraph(s.graph);
    return { requestType: s.requestType, name: s.name, description: s.description, module: s.module, fields: s.fields, steps, notifyRules, graph: s.graph, active: true, publishedVersion: 1 };
  });
