import { Module } from '@nestjs/common';
import { AcademicDocsController, AcademicDocsPublicController } from './academic-docs.controller.js';
import { AcademicDocsService } from './academic-docs.service.js';

/** Standalone transcript, provisional certificate and consolidated grade card with request, approval and signed QR verification. */
@Module({ controllers: [AcademicDocsController, AcademicDocsPublicController], providers: [AcademicDocsService], exports: [AcademicDocsService] })
export class AcademicDocsModule {}
