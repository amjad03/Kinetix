var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ContentController, SubjectCourseController } from './content.controller.js';
import { ContentService } from './content.service.js';
let ContentModule = class ContentModule {
};
ContentModule = __decorate([
    Module({ providers: [ContentService], controllers: [ContentController, SubjectCourseController], exports: [ContentService] })
], ContentModule);
export { ContentModule };
//# sourceMappingURL=content.module.js.map