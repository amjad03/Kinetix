import { Module } from '@nestjs/common';
import { CrossrefDoiResolver, DoiResolver } from './doi.js';
import { DatasetsController } from './datasets.controller.js';
import { ResearchOfficeController } from './research-office.controller.js';
import { ResearchController } from './research.controller.js';
import { ResearchRecords } from './research.records.js';
import { ResearchReportsController } from './research-reports.controller.js';
import { OrcidResolver, PublicOrcidResolver } from './orcid.js';
import { ThesisController } from './thesis.controller.js';

/** Research proposals, projects, scholars, theses, datasets, publications, grants, the research office view and NAAC criterion 3 KPIs. */
@Module({
  controllers: [ResearchController, ThesisController, DatasetsController, ResearchOfficeController, ResearchReportsController],
  providers: [{ provide: DoiResolver, useClass: CrossrefDoiResolver }, { provide: OrcidResolver, useClass: PublicOrcidResolver }, ResearchRecords],
})
export class ResearchModule {}
