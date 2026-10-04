import type { ClassStatus } from './types';

export const STATUS_LABEL: Record<ClassStatus, string> = {
  live: 'Live',
  taught: 'Taught',
  not_started: 'Not started',
  missed: 'Missed',
  upcoming: 'Upcoming',
};

export const STATUS_ORDER: ClassStatus[] = ['live', 'not_started', 'taught', 'missed', 'upcoming'];

export const STATUS_HELP: Record<ClassStatus, string> = {
  live: 'A teacher is signed in on the board for this class right now',
  taught: 'The class was held: a board session or attendance was recorded',
  not_started: 'The period has begun but nobody has started the class yet',
  missed: 'The period ended with no board session and no attendance',
  upcoming: 'Later today or on a future day',
};
