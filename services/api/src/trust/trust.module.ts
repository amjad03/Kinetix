import { Module } from '@nestjs/common';
import { TrustController } from './trust.controller.js';

/** Trusted devices and new-device sign-in notes. */
@Module({ controllers: [TrustController] })
export class TrustModule {}
