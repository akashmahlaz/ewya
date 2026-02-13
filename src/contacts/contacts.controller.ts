import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SaveContactDto, ContactDto } from './dto/contact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Post()
  async saveContact(
    @Request() req,
    @Body() saveContactDto: SaveContactDto,
  ): Promise<ContactDto> {
    return this.contactsService.saveContact(req.user.userId, saveContactDto);
  }

  @Get()
  async getSavedContacts(@Request() req): Promise<ContactDto[]> {
    return this.contactsService.getSavedContacts(req.user.userId);
  }

  @Get(':contactId')
  async getContact(
    @Request() req,
    @Param('contactId') contactId: string,
  ): Promise<ContactDto | null> {
    return this.contactsService.getContactById(req.user.userId, contactId);
  }

  @Delete(':contactId')
  async deleteContact(
    @Request() req,
    @Param('contactId') contactId: string,
  ): Promise<{ success: boolean }> {
    const success = await this.contactsService.deleteContact(req.user.userId, contactId);
    return { success };
  }
}
