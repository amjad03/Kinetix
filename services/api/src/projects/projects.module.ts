import { Module } from '@nestjs/common';
import { ImpactController } from './impact.controller.js';
import { ProjectsController } from './projects.controller.js';

/** Project workspace (files, discussion, reviews, viva, showcase, matching, portfolio) and the custom impact framework. */
@Module({ controllers: [ProjectsController, ImpactController] })
export class ProjectsModule {}
