import { Module } from '@nestjs/common';
import { ConsentAdminController, ConsentController } from './consent.controller.js';

/** DPDP consent records. */
@Module({ controllers: [ConsentController, ConsentAdminController] })
export class ConsentModule {}
