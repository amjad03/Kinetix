import { describe, expect, it } from 'vitest';
import { nextTrainingSteps } from './trainings';

describe('training request steps', () => {
  it('a new request can be confirmed or cancelled; a confirmed one completed or cancelled; finished ones are closed', () => {
    expect(nextTrainingSteps('requested')).toEqual(['confirmed', 'cancelled']);
    expect(nextTrainingSteps('confirmed')).toEqual(['done', 'cancelled']);
    expect(nextTrainingSteps('done')).toEqual([]);
    expect(nextTrainingSteps('cancelled')).toEqual([]);
  });
});
