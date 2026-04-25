import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from './access.guard';
import { RequireCasl } from './require-permission.decorator';
import { AccessService } from './access.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplaceRolePermissionsDto } from './dto/replace-role-permissions.dto';

@Controller('access-control')
@UseGuards(JwtAuthGuard, AccessGuard)
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get('roles')
  @RequireCasl({ action: 'read', subject: 'Role' })
  async getRoles() {
    return this.accessService.listRoles();
  }

  @Post('roles')
  @RequireCasl({ action: 'create', subject: 'Role' })
  async createRole(@Body() dto: CreateRoleDto) {
    return this.accessService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequireCasl({ action: 'update', subject: 'Role' })
  async updateRole(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.accessService.updateRole(roleId, dto);
  }

  @Delete('roles/:id')
  @RequireCasl({ action: 'delete', subject: 'Role' })
  async deleteRole(@Param('id', new ParseUUIDPipe()) roleId: string) {
    return this.accessService.deleteRole(roleId);
  }

  @Get('permissions')
  @RequireCasl({ action: 'read', subject: 'Role' })
  async getPermissions() {
    return this.accessService.listPermissions();
  }

  @Get('roles/:id/permissions')
  @RequireCasl({ action: 'read', subject: 'Role' })
  async getRolePermissions(@Param('id', new ParseUUIDPipe()) roleId: string) {
    return this.accessService.getRolePermissions(roleId);
  }

  @Put('roles/:id/permissions')
  @RequireCasl({ action: 'assignPermission', subject: 'Role' })
  async replaceRolePermissions(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.accessService.replaceRolePermissions(roleId, dto.permissionIds);
  }
}
