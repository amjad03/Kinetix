import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/time.js';
import { CalendarService } from './calendar.service.js';
import { TimetableService } from './timetable.service.js';

@Global()
@Module({
  providers: [TimetableService, CalendarService, { provide: Clock, useClass: SystemClock }],
  exports: [TimetableService, CalendarService, Clock],
})
export class TimetableModule {}
