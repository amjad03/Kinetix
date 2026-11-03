import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/time.js';
import { CalendarService } from './calendar.service.js';
import { DayTimetableService } from './day-timetable.service.js';
import { SubstitutionsController } from './substitutions.controller.js';
import { SubstitutionsService } from './substitutions.service.js';
import { TimetableService } from './timetable.service.js';

@Global()
@Module({
  controllers: [SubstitutionsController],
  providers: [TimetableService, CalendarService, DayTimetableService, SubstitutionsService, { provide: Clock, useClass: SystemClock }],
  exports: [TimetableService, CalendarService, DayTimetableService, SubstitutionsService, Clock],
})
export class TimetableModule {}
