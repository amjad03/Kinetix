import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ObjectStorage, storageFromEnv } from './storage.service.js';

@Global()
@Module({
  providers: [{ provide: ObjectStorage, inject: [ENV], useFactory: (env: Env) => storageFromEnv(env) }],
  exports: [ObjectStorage],
})
export class StorageModule {}
