import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module.js';
import { SchedulingController } from './scheduling.controller.js';

/** Term presets, calendar feeds, subject frequency, timetable generation, attendance roll-ups, student punches and PUC class sections. */
@Module({ imports: [StudentsModule], controllers: [SchedulingController] })
export class SchedulingModule {}
