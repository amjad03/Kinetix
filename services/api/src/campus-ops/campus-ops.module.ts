import { Module } from '@nestjs/common';
import { CampusOpsController } from './campus-ops.controller.js';

/** Settings, record views, reports and stock verification across admissions and campus operations. */
@Module({ controllers: [CampusOpsController] })
export class CampusOpsModule {}
