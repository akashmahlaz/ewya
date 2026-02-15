import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ConversationMessageDto {
  role: string;
  content: string;
  timestamp: string;
  contacts: any[];
  suggestedActions: string[];
}

export class ConversationDto {
  id: string;
  title: string;
  messages: ConversationMessageDto[];
  contactCount: number;
  followUpCount: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ConversationListItemDto {
  id: string;
  title: string;
  lastMessage: string;
  contactCount: number;
  followUpCount: number;
  createdAt: string;
  updatedAt: string;
}

export class UpdateConversationDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsOptional()
  isArchived?: boolean;
}
