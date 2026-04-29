import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
        const prettyFromEnv = configService.get<string>('LOG_PRETTY');
        const pretty =
          prettyFromEnv === 'true' ||
          (prettyFromEnv !== 'false' && nodeEnv !== 'production');

        return {
          pinoHttp: {
            level: configService.get<string>('LOG_LEVEL') ?? 'info',
            genReqId: (req: {
              headers: Record<string, string | string[] | undefined>;
            }) => {
              const incoming = req.headers['x-request-id'];
              return typeof incoming === 'string' && incoming.length > 0
                ? incoming
                : randomUUID();
            },
            customProps: (req) => ({
              requestId:
                typeof req.id === 'string' || typeof req.id === 'number'
                  ? String(req.id)
                  : undefined,
            }),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                '*.password',
                '*.token',
                '*.accessToken',
                '*.refreshToken',
              ],
              censor: '[REDACTED]',
            },
            transport: pretty
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
