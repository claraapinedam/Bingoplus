import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SupportCasesService } from './support-cases.service';
import { CreateSupportCaseDto } from './dto/create-support-case.dto';

/** Shared surface for Customer/Business/Rider — same "one controller, caller says which context
 * it's for" convention as NotificationsController (`audience`), just via `submitterType` in the
 * body instead of a query param, since this is a POST-first flow. Ownership is always by
 * submitterUserId = the caller, so there's nothing more to scope by in the route itself. */
@ApiTags('me/support/cases')
@Controller('me/support/cases')
export class SupportCasesController {
  constructor(private readonly cases: SupportCasesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupportCaseDto) {
    return this.cases.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.cases.listMine(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cases.getMine(user.id, id);
  }
}
