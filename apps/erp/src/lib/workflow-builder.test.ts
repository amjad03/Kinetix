import { describe, expect, it } from 'vitest';
import { blankNode, countNodes, findNode, insertNode, parseValue, removeNode, updateNode, validateGraph, type BuilderGraph } from './workflow-builder';

const g: BuilderGraph = {
  trigger: { id: 'trigger', type: 'trigger', name: 'Submitted', sources: ['staff_desk'] },
  nodes: [
    { id: 'c1', type: 'condition', name: 'Big?', field: 'amount', op: '>', value: 1000, yes: [{ id: 'a1', type: 'approval', name: 'Principal', approver: { kind: 'role', role: 'principal' }, slaHours: 24 }], no: [] },
    { id: 'n1', type: 'notify', name: 'Tell', channels: ['app'], template: 'decision', when: 'decided', to: 'requester' },
  ],
};

describe('workflow builder graph', () => {
  it('validates like the API', () => {
    expect(validateGraph(g, [])).toEqual([]);
    const bad = insertNode(g, { parent: 'c1', branch: 'no' }, 0, blankNode(g, 'approval'));
    expect(validateGraph(bad, []).map((i) => i.code)).toEqual(['name_missing', 'approver_missing']);
    expect(validateGraph({ ...g, nodes: [] }, []).map((i) => i.code)).toEqual(['no_approval']);
    expect(validateGraph(updateNode(g, 'c1', { field: 'days' }), []).map((i) => i.code)).toEqual(['field_unknown']);
    expect(validateGraph(updateNode(g, 'c1', { field: 'days' }), ['days'])).toEqual([]);
  });

  it('inserts, finds, updates and removes nodes without touching the original', () => {
    const node = blankNode(g, 'notify');
    expect(node.id).toBe('n2');
    const next = insertNode(g, { parent: null }, 1, node);
    expect(countNodes(next)).toBe(4);
    expect(countNodes(g)).toBe(3);
    expect(findNode(next, 'n2')?.type).toBe('notify');
    expect(countNodes(removeNode(next, 'c1'))).toBe(2);
  });

  it('parses condition values', () => {
    expect(parseValue('25000', '>')).toBe(25000);
    expect(parseValue('Transfer', '==')).toBe('Transfer');
    expect(parseValue('lab, 3', 'in')).toEqual(['lab', 3]);
    expect(parseValue(' ', '>')).toBeNull();
  });
});
