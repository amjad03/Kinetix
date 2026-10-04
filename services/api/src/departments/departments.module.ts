import { Module } from "@nestjs/common";
import {
  DepartmentsAdminController,
  DepartmentsController,
} from "./departments.controller.js";

/** Departments and the head of department's view. */
@Module({ controllers: [DepartmentsController, DepartmentsAdminController] })
export class DepartmentsModule {}
