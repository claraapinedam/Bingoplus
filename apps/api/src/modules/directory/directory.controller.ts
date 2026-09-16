import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DirectoryService } from './directory.service';
import { ListDirectoryQueryDto } from './dto/list-directory-query.dto';

@ApiTags('public/directory')
@Controller('public/directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Public()
  @Get()
  list(@Query() query: ListDirectoryQueryDto) {
    return this.directory.list(query);
  }
}
