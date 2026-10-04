import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { configureApp } from './setup.js';
async function bootstrap() {
    const env = loadEnv();
    const app = await NestFactory.create(AppModule, { rawBody: true }); // rawBody: payment webhook signatures
    configureApp(app);
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('KINETIX Cloud API').setVersion('0.1').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc);
    await app.listen(env.PORT);
}
void bootstrap();
//# sourceMappingURL=main.js.map