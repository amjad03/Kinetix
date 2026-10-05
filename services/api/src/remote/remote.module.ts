import { Module } from '@nestjs/common';
import { RemoteController } from './remote.controller.js';
import { RemoteGateway } from './remote.gateway.js';
import { RemoteService } from './remote.service.js';

/** The phone remote: the Teacher App drives the board its teacher is teaching on. */
@Module({ controllers: [RemoteController], providers: [RemoteGateway, RemoteService] })
export class RemoteModule {}
