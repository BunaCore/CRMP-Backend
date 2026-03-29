import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS - allow all origins
  app.enableCors({
    origin: '*',
  });

  // Global validation pipe with custom error handling
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true, // Auto-transform payload to DTO instance
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const structured = errors.map((error) => ({
          field: error.property,
          errors: error.constraints,
          errorStr: error.constraints
            ? Object.values(error.constraints)[0]
            : null, // Get the first error message
        }));
        return new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: structured,
        });
      },
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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
