// Trigger restart - port changed to 3001
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { Logger } from 'nestjs-pino';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { attachCollabWsServer } from './collaboration/collab-ws.server';
import { CollaborationYjsRepository } from './collaboration/yjs/collaboration-yjs.repository';
import { WorkspaceAccessService } from './documents/workspace-access.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // app.useLogger(app.get(Logger));

  // Enable CORS - allow all origins
  app.enableCors({
    origin: '*',
  });

  // Increase payload limit for Base64 images
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Global exception filter - handles all errors at the edge
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(Logger)));

  // Global validation pipe with custom error handling
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true, // Auto-transform payload to DTO instance
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CRMP Backend API')
    .setDescription('API documentation for CRMP backend services')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste JWT token',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ── y-websocket server (WebsocketProvider backend) ───────────────────────
  // Attach raw WS server to the NestJS HTTP server for /collab/*
  // Must happen before listen() so upgrade handler is ready.
  await app.init();
  const httpServer = app.getHttpServer() as import('http').Server;
  attachCollabWsServer(
    httpServer,
    app.get(JwtService),
    app.get(ConfigService).get<string>('JWT_SECRET') ?? '',
    app.get(CollaborationYjsRepository),
    app.get(WorkspaceAccessService),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
