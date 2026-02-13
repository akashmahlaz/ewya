import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchQueryDto, SearchResultDto } from '../contacts/dto/contact.dto';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Post()
  async search(
    @Request() req,
    @Body() searchQueryDto: SearchQueryDto,
  ): Promise<SearchResultDto> {
    return this.searchService.searchContacts(req.user.userId, searchQueryDto.query);
  }

  @Get('history')
  async getHistory(@Request() req): Promise<any[]> {
    return this.searchService.getSearchHistory(req.user.userId);
  }

  @Delete('history/:id')
  async deleteHistory(
    @Request() req,
    @Param('id') historyId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.searchService.deleteSearchHistory(
      req.user.userId,
      historyId,
    );
    return { success };
  }

  @Delete('history')
  async clearHistory(@Request() req): Promise<{ success: boolean }> {
    const success = await this.searchService.clearSearchHistory(req.user.userId);
    return { success };
  }
}
