import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/time.js';
import { TimetableService } from './timetable.service.js';

@Global()
@Module({
  providers: [TimetableService, { provide: Clock, useClass: SystemClock }],
  exports: [TimetableService, Clock],
})
export class TimetableModule {}
