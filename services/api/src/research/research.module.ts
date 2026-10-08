import { Module } from '@nestjs/common';
import { ResearchController } from './research.controller.js';

/** Research proposals, projects, scholars, publications, grants and NAAC criterion 3 KPIs. */
@Module({ controllers: [ResearchController] })
export class ResearchModule {}
