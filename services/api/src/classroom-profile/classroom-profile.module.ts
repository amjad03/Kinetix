import { Module } from '@nestjs/common';
import { ClassroomProfileController, SharedClassNotesController, StudentClassroomController } from './classroom-profile.controller.js';
import { ClassroomProfileService } from './classroom-profile.service.js';

/** Board profile: Your Classrooms, Schedule a Training, End class with notes, and the student buzzer. */
@Module({ controllers: [ClassroomProfileController, StudentClassroomController, SharedClassNotesController], providers: [ClassroomProfileService] })
export class ClassroomProfileModule {}
