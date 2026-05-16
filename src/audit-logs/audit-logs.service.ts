import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditLogCreateInput } from './types/audit-log.types';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly repository: AuditLogsRepository) {}

  async record(input: AuditLogCreateInput) {
    return this.repository.insertAuditLog(input);
  }

  async list(query: GetAuditLogsQueryDto) {
    const result = await this.repository.findAuditLogs(query);

    return {
      items: result.items,
      next: result.next,
    };
  }
}
