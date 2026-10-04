import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env.js';
import { DbService } from './db.service.js';
import { SystemLookups } from './system-lookups.service.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, DbService, SystemLookups],
  exports: [ENV, DbService, SystemLookups],
})
export class DbModule {}
