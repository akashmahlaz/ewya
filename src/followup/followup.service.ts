import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ContactsService } from '../contacts/contacts.service';
import { GenerateFollowUpDto, FollowUpResponseDto, FollowUpChannel } from './dto/followup.dto';

@Injectable()
export class FollowUpService {
  private openaiApiKey: string;

  constructor(
    private configService: ConfigService,
    private contactsService: ContactsService,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async generateFollowUp(
    userId: string,
    dto: GenerateFollowUpDto,
  ): Promise<FollowUpResponseDto> {
    try {
      // Get contact details
      const contact = await this.contactsService.getContactById(userId, dto.contactId);
      if (!contact) {
        throw new HttpException('Contact not found', HttpStatus.NOT_FOUND);
      }

      const systemPrompt = this.getSystemPrompt(dto.channel);
      const userPrompt = this.buildUserPrompt(contact, dto.context, dto.channel);

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      const result = this.parseFollowUpResponse(content, dto.channel);

      return {
        ...result,
        channel: dto.channel,
      };
    } catch (error) {
      console.error('Follow-up generation error:', error.response?.data || error.message);
      throw new HttpException(
        'Failed to generate follow-up message',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getSystemPrompt(channel: FollowUpChannel): string {
    const basePrompt = `You are a professional communication assistant that helps craft follow-up messages. 
Write natural, personalized, and professional messages that feel human and authentic.`;

    switch (channel) {
      case FollowUpChannel.EMAIL:
        return `${basePrompt}

For EMAIL messages:
- Include a subject line
- Use proper email formatting
- Be concise but professional
- Include a clear call-to-action

Return JSON format:
{
  "subject": "Email subject line",
  "body": "Email body text"
}`;

      case FollowUpChannel.WHATSAPP:
        return `${basePrompt}

For WHATSAPP messages:
- Keep it casual but professional
- Use shorter paragraphs
- Be friendly and direct
- Avoid overly formal language

Return JSON format:
{
  "body": "WhatsApp message text"
}`;

      case FollowUpChannel.SMS:
        return `${basePrompt}

For SMS messages:
- Keep it very brief (160 characters or less if possible)
- Be direct and clear
- Include your name
- Make it action-oriented

Return JSON format:
{
  "body": "SMS message text"
}`;
    }
  }

  private buildUserPrompt(
    contact: any,
    context: string,
    channel: FollowUpChannel,
  ): string {
    return `Generate a ${channel.toLowerCase()} message to follow up with:

Contact Details:
- Name: ${contact.name}
- Title: ${contact.title || 'N/A'}
- Company: ${contact.company || 'N/A'}

Context/Purpose: ${context}

Create a personalized, professional message appropriate for this channel.`;
  }

  private parseFollowUpResponse(
    content: string,
    channel: FollowUpChannel,
  ): { subject?: string; body: string } {
    try {
      const parsed = JSON.parse(content);
      return {
        subject: parsed.subject,
        body: parsed.body,
      };
    } catch {
      // If JSON parsing fails, use the raw content as body
      return {
        subject: channel === FollowUpChannel.EMAIL ? 'Follow-up' : undefined,
        body: content,
      };
    }
  }
}
