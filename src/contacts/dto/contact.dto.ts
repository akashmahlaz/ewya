import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;
}

export class ContactDto {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  location?: string;
  industry?: string;
  emails: string[];
  phones: string[];
  linkedInUrl?: string;
  profileImageUrl?: string;
  relevanceScore?: number;
  summary?: string;
}

export class SearchResultDto {
  contacts: ContactDto[];
  message: string;
  totalResults: number;
}

export class SaveContactDto {
  @IsString()
  @IsNotEmpty()
  contactId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsArray()
  @IsString({ each: true })
  emails: string[];

  @IsArray()
  @IsString({ each: true })
  phones: string[];

  @IsString()
  @IsOptional()
  linkedInUrl?: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @IsNumber()
  @IsOptional()
  relevanceScore?: number;

  @IsString()
  @IsOptional()
  summary?: string;
}
