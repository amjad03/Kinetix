import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { LifeExtrasController } from './life-extras.controller.js';
import { CampusLifeService } from './campus-life.service.js';
import { ClubsController } from './clubs.controller.js';
import { CommitteesController } from './committees.controller.js';
import { EventsController } from './events.controller.js';
import { PublicEventsController } from './public-events.controller.js';

/** Clubs and student life, committees and their minutes, and campus events with QR check-in. */
@Module({ imports: [DocumentsModule], controllers: [ClubsController, CommitteesController, EventsController, PublicEventsController, LifeExtrasController], providers: [CampusLifeService] })
export class CampusLifeModule {}
