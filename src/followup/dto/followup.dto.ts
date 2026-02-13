import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum FollowUpChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

export class GenerateFollowUpDto {
  @IsString()
  @IsNotEmpty()
  contactId: string;

  @IsEnum(FollowUpChannel)
  channel: FollowUpChannel;

  @IsString()
  @IsNotEmpty()
  context: string;
}

export class FollowUpResponseDto {
  subject?: string;
  body: string;
  channel: FollowUpChannel;
}
