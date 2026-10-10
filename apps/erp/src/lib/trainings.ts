// A teacher's training request from the board (API: /v1/classroom/trainings).

export const TRAINING_STATUSES = ['requested', 'confirmed', 'done', 'cancelled'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export interface TrainingRequestRow {
  id: string;
  slotAt: string;
  topic: string;
  notes: string;
  status: TrainingStatus;
  adminNote: string;
  requester: string | null;
  createdAt: string;
}

/** What an admin may do next with a request in this state. */
export function nextTrainingSteps(status: TrainingStatus): TrainingStatus[] {
  switch (status) {
    case 'requested':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['done', 'cancelled'];
    default:
      return [];
  }
}
