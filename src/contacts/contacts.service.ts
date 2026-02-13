import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import { SaveContactDto, ContactDto } from './dto/contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
  ) {}

  async saveContact(userId: string, contactDto: SaveContactDto): Promise<ContactDto> {
    const contact = await this.contactModel.findOneAndUpdate(
      { userId, contactId: contactDto.contactId },
      { ...contactDto, userId },
      { upsert: true, new: true },
    );

    return this.mapToDto(contact);
  }

  async getSavedContacts(userId: string): Promise<ContactDto[]> {
    const contacts = await this.contactModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();

    return contacts.map((contact) => this.mapToDto(contact));
  }

  async getContactById(userId: string, contactId: string): Promise<ContactDto | null> {
    const contact = await this.contactModel
      .findOne({ userId, contactId })
      .exec();

    return contact ? this.mapToDto(contact) : null;
  }

  async deleteContact(userId: string, contactId: string): Promise<boolean> {
    const result = await this.contactModel.deleteOne({ userId, contactId });
    return result.deletedCount > 0;
  }

  private mapToDto(contact: ContactDocument): ContactDto {
    return {
      id: contact.contactId,
      name: contact.name,
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title,
      company: contact.company,
      location: contact.location,
      industry: contact.industry,
      emails: contact.emails,
      phones: contact.phones,
      linkedInUrl: contact.linkedInUrl,
      profileImageUrl: contact.profileImageUrl,
      relevanceScore: contact.relevanceScore,
      summary: contact.summary,
    };
  }
}
