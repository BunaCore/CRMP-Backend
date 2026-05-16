import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from 'src/common/pagination/utils/build-pagination-meta';
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
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.repository.findAuditLogs(query);

    return {
      items: result.items,
      meta: buildPaginationMeta(page, limit, result.totalItems),
    };
  }
}
