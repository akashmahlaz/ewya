import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SendMessageDto,
  ConversationDto,
  ConversationListItemDto,
  UpdateConversationDto,
} from './dto/conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Post()
  async createConversation(@Request() req): Promise<ConversationDto> {
    return this.conversationsService.createConversation(req.user.userId);
  }

  @Get()
  async getConversations(
    @Request() req,
  ): Promise<ConversationListItemDto[]> {
    return this.conversationsService.getConversations(req.user.userId);
  }

  // ─── Search History (backward compat) ──────────────────────
  // MUST be defined BEFORE :id routes to avoid route conflict

  @Get('search/history')
  async getSearchHistory(@Request() req): Promise<any[]> {
    return this.conversationsService.getSearchHistory(req.user.userId);
  }

  @Delete('search/history/:id')
  async deleteSearchHistory(
    @Request() req,
    @Param('id') historyId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.conversationsService.deleteSearchHistory(
      req.user.userId,
      historyId,
    );
    return { success };
  }

  @Delete('search/history')
  async clearSearchHistory(@Request() req): Promise<{ success: boolean }> {
    const success = await this.conversationsService.clearSearchHistory(
      req.user.userId,
    );
    return { success };
  }

  @Get(':id')
  async getConversation(
    @Request() req,
    @Param('id') conversationId: string,
  ): Promise<ConversationDto> {
    return this.conversationsService.getConversation(
      req.user.userId,
      conversationId,
    );
  }

  @Post(':id/messages')
  async sendMessage(
    @Request() req,
    @Param('id') conversationId: string,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<ConversationDto> {
    return this.conversationsService.sendMessage(
      req.user.userId,
      conversationId,
      sendMessageDto.message,
    );
  }

  @Delete(':id')
  async deleteConversation(
    @Request() req,
    @Param('id') conversationId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.conversationsService.deleteConversation(
      req.user.userId,
      conversationId,
    );
    return { success };
  }

  @Patch(':id/archive')
  async archiveConversation(
    @Request() req,
    @Param('id') conversationId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.conversationsService.archiveConversation(
      req.user.userId,
      conversationId,
    );
    return { success };
  }

}
