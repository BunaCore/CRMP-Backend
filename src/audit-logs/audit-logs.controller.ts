import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequireCasl } from 'src/access-control/require-permission.decorator';
import { AuditLogsService } from './audit-logs.service';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, AccessGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequireCasl({ action: 'read', subject: 'AuditLog' })
  async listAuditLogs(@Query() query: GetAuditLogsQueryDto) {
    return this.auditLogsService.list(query);
  }

  @Get('stats')
  @RequireCasl({ action: 'read', subject: 'AuditLog' })
  async auditLogStats(@Query() query: GetAuditLogsQueryDto) {
    return this.auditLogsService.stats(query);
  }
}
