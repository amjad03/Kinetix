import { Module } from '@nestjs/common';
import { TallyController, TallySync } from './tally.controller.js';

/** Live sync of the books to Tally Prime over its HTTP/XML port, with an offline XML file fallback. */
@Module({ controllers: [TallyController], providers: [TallySync], exports: [TallySync] })
export class TallyModule {}
