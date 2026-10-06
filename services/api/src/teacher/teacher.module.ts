import { ProfilePhotoController } from '../profile/profile.controller.js';
import { Module } from '@nestjs/common';
import { AttendanceController, HomeworkController, MeController, SectionsController, TeacherController } from './teacher.controller.js';
import { TeacherService } from './teacher.service.js';

/** Endpoints for the Teacher App: profile, day timetable, rosters, attendance, homework. */
@Module({
  controllers: [MeController, ProfilePhotoController, TeacherController, SectionsController, AttendanceController, HomeworkController],
  providers: [TeacherService],
  exports: [TeacherService],
})
export class TeacherModule {}
