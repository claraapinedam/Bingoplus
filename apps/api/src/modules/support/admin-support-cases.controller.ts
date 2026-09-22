import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName, SupportCaseStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SupportCasesService } from './support-cases.service';
import { RespondSupportCaseDto } from './dto/respond-support-case.dto';
import { SetSupportCaseStatusDto } from './dto/set-support-case-status.dto';

class ListSupportCasesQueryDto {
  @ApiPropertyOptional({ enum: SupportCaseStatus })
  @IsOptional()
  @IsEnum(SupportCaseStatus)
  status?: SupportCaseStatus;
}

/** Admin → "Soporte" → "Soporte técnico": the list of general cases (code, submitter, what they
 * wrote, evidence), a response thread and RECIBIDO → EN PROGRESO → CERRADO status control. */
@ApiTags('admin/support/cases')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/support/cases')
export class AdminSupportCasesController {
  constructor(private readonly cases: SupportCasesService) {}

  @Get()
  list(@Query() query: ListSupportCasesQueryDto) {
    return this.cases.listAll(query.status);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.cases.getOneAdmin(id);
  }

  @Audit('support-case.respond', 'SupportCase')
  @Post(':id/responses')
  respond(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: RespondSupportCaseDto) {
    return this.cases.respond(id, admin.id, dto);
  }

  @Audit('support-case.status', 'SupportCase')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetSupportCaseStatusDto) {
    return this.cases.setStatus(id, dto.status);
  }
}
