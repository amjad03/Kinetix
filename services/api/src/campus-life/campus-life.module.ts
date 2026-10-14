import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { LifeExtrasController } from './life-extras.controller.js';
import { CampusLifeService } from './campus-life.service.js';
import { ClubsController } from './clubs.controller.js';
import { CommitteesController } from './committees.controller.js';
import { EventsController } from './events.controller.js';
import { PublicEventsController } from './public-events.controller.js';
import { ElectionsController } from './elections.controller.js';
import { LifeDepthController } from './life-depth.controller.js';
import { CampusDepthService } from './life-depth.service.js';
import { CampusLifeRecords } from './life.records.js';

/**
 * Clubs and student life, committees and their minutes, campus events with QR check-in, NSS/NCC and sports units,
 * achievements, outreach, club budgets and student council elections.
 */
@Module({ imports: [DocumentsModule], controllers: [ClubsController, CommitteesController, EventsController, PublicEventsController, LifeExtrasController, LifeDepthController, ElectionsController], providers: [CampusLifeService, CampusDepthService, CampusLifeRecords] })
export class CampusLifeModule {}
