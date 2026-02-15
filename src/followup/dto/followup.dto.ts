import { IsString, IsNotEmpty, IsEnum, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

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

export class BatchFollowUpContactDto {
  @IsString()
  @IsNotEmpty()
  contactId: string;

  @IsString()
  @IsNotEmpty()
  contactName: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  company?: string;
}

export class BatchFollowUpDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchFollowUpContactDto)
  contacts: BatchFollowUpContactDto[];

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

export class BatchFollowUpResponseDto {
  results: {
    contactId: string;
    contactName: string;
    subject?: string;
    body: string;
    channel: string;
  }[];
}
