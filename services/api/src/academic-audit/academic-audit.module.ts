import { Module } from '@nestjs/common';
import { AcademicAuditController } from './academic-audit.controller.js';

/** Academic audit: templates, department audits, findings and non-conformities. */
@Module({ controllers: [AcademicAuditController] })
export class AcademicAuditModule {}
