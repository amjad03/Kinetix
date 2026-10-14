import { Module } from '@nestjs/common';
import { DepartmentsAdminController, DepartmentsController } from './departments.controller.js';
import { DepartmentRecords } from './departments.records.js';

/** Departments and the head of department's view. */
@Module({ controllers: [DepartmentsController, DepartmentsAdminController], providers: [DepartmentRecords] })
export class DepartmentsModule {}
