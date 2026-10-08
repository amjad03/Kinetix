import { Module } from '@nestjs/common';
import { HrModule } from '../hr/hr.module.js';
import { FinanceController } from './finance.controller.js';
import { ScholarshipsController } from './scholarships.controller.js';

/** Scholarships, budgets, fee refunds and the GL journal export (docs/product/finance.md). */
@Module({ imports: [HrModule], controllers: [FinanceController, ScholarshipsController] })
export class FinanceModule {}
