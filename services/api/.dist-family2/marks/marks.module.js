var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { AssessmentsController, StudentMarksController } from './marks.controller.js';
let MarksModule = class MarksModule {
};
MarksModule = __decorate([
    Module({ imports: [NotificationsModule, TeacherModule], controllers: [AssessmentsController, StudentMarksController] })
], MarksModule);
export { MarksModule };
//# sourceMappingURL=marks.module.js.map