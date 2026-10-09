import { Module } from '@nestjs/common';
import { CareersModule } from '../careers/careers.module.js';
import { CommsModule } from '../comms/comms.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { RetentionModule } from '../retention/retention.module.js';

/**
 * Student pathways and institutional extras added with migration 0119: project workspace and impact, careers,
 * research depth, student-life extras, evidence, retention, communication and parent visibility.
 * One module so the app module needs a single import.
 */
@Module({ imports: [ProjectsModule, CareersModule, CommsModule, RetentionModule] })
export class PathwaysModule {}
