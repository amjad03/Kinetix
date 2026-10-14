import { Global, Module } from '@nestjs/common';
import { PairingModule } from '../pairing/pairing.module.js';
import { BrandingService } from './branding.service.js';
import { BrandingController, DocTemplatesController, IssuedDocsController } from './doc-engine.controller.js';
import { DocTemplatesService } from './doc-templates.service.js';
import { DocumentEngine } from './document-engine.service.js';
import { IssuedDocsService } from './issued-docs.service.js';

/**
 * Branding, document templates, the register of issued documents and the rendering engine
 * (docs/architecture/documents-certificates.md). Global, so every module that prints a document
 * renders it through {@link DocumentEngine}.
 */
@Global()
@Module({
  imports: [PairingModule],
  controllers: [BrandingController, DocTemplatesController, IssuedDocsController],
  providers: [BrandingService, DocTemplatesService, IssuedDocsService, DocumentEngine],
  exports: [BrandingService, DocTemplatesService, IssuedDocsService, DocumentEngine],
})
export class DocEngineModule {}
