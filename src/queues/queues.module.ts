import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { MailProcessor } from './mail/mail.processor';
import { MailProducer } from './mail/mail.producer';
import { MailModule } from 'src/mail/mail.module';

/**
 * QueuesModule: Configures BullMQ for background jobs
 * - Redis connection for job queue
 * - Mail queue for email sending jobs
 * - MailProducer for adding jobs
 * - MailProcessor for executing jobs
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL');

        return {
          redis: url,
        };
      },
    }),
    BullModule.registerQueue({
      name: 'mail',
    }),
    MailModule,
  ],
  providers: [MailProcessor, MailProducer],
  exports: [MailProducer],
})
export class QueuesModule {}
