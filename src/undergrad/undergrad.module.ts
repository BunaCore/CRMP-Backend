import { Module } from '@nestjs/common';
import { UndergradController } from './undergrad.controller';
import { UndergradService } from './undergrad.service';
import { UndergradRepository } from './undergrad.repository';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { DbModule } from 'src/db/db.module';

/**
 * UndergradModule
 *
 * Handles all UG coordinator proposal-review APIs.
 *
 * Why we export UndergradRepository:
 *   Other future modules (e.g., ReportsModule, PgModule) can import
 *   UndergradModule and inject UndergradRepository directly — no code
 *   duplication, full reusability.
 */
@Module({
  imports: [
    DbModule, // provides DrizzleService to the repository
    AccessControlModule, // provides AccessGuard + AccessService to the controller
  ],
  controllers: [UndergradController],
  providers: [UndergradService, UndergradRepository],
  exports: [UndergradRepository], // ← reusable by any future module
})
export class UndergradModule {}
