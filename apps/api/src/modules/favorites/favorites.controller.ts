import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FavoritesService } from './favorites.service';
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto';
import { ListFavoritesQueryDto } from './dto/list-favorites-query.dto';

@ApiTags('me/favorites')
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListFavoritesQueryDto) {
    return this.favorites.list(user.id, query.targetType);
  }

  @Get('businesses')
  listBusinesses(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.listFavoriteBusinesses(user.id);
  }

  @Post('toggle')
  toggle(@CurrentUser() user: AuthenticatedUser, @Body() dto: ToggleFavoriteDto) {
    return this.favorites.toggle(user.id, dto.targetType, dto.targetId);
  }
}
