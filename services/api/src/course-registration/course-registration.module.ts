import { Module } from '@nestjs/common';
import { CourseRegistrationController, MyCourseRegistrationController } from './course-registration.controller.js';
import { CourseRegistrationService } from './course-registration.service.js';
import { OfferingRecords } from './offerings.records.js';

/** CBCS/CBE course registration: offerings, windows, rules, preference allocation, waitlist and approval. */
@Module({ controllers: [CourseRegistrationController, MyCourseRegistrationController], providers: [CourseRegistrationService, OfferingRecords], exports: [CourseRegistrationService] })
export class CourseRegistrationModule {}
