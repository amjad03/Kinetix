import type { ClassStatus } from './types';

// Labels and help: `status.<status>` and `status.help.<status>` in the dictionary (src/i18n/messages/common.ts).
export const STATUS_ORDER: ClassStatus[] = ['live', 'not_started', 'taught', 'missed', 'upcoming'];
