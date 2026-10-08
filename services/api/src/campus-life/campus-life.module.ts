import { Module } from '@nestjs/common';
import { CampusLifeService } from './campus-life.service.js';
import { ClubsController } from './clubs.controller.js';
import { CommitteesController } from './committees.controller.js';
import { EventsController } from './events.controller.js';

/** Clubs and student life, committees and their minutes, and campus events with QR check-in. */
@Module({ controllers: [ClubsController, CommitteesController, EventsController], providers: [CampusLifeService] })
export class CampusLifeModule {}
