import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ContactsService } from '../contacts/contacts.service';
import { GenerateFollowUpDto, FollowUpResponseDto, FollowUpChannel, BatchFollowUpDto, BatchFollowUpResponseDto } from './dto/followup.dto';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);
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

      this.logger.log(`[FollowUp] Sending request with model: gpt-5.2-pro (Responses API)`);
      this.logger.log(`[FollowUp] Channel: ${dto.channel} | Contact: ${contact.name}`);

      const response = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: 'gpt-5.2-pro',
          instructions: systemPrompt,
          input: userPrompt,
          reasoning: { effort: 'low' },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Extract text from Responses API output
      let content = '';
      for (const item of response.data.output) {
        if (item.type === 'message' && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text') {
              content += contentItem.text;
            }
          }
        }
      }

      this.logger.log(`[FollowUp] OpenAI model used: ${response.data.model}`);
      this.logger.log(`[FollowUp] Output items: ${response.data.output?.length}`);
      this.logger.log(`[FollowUp] Raw response length: ${content.length}`);

      const result = this.parseFollowUpResponse(content, dto.channel);

      this.logger.log(`[FollowUp] Generated successfully for channel: ${dto.channel}`);
      return {
        ...result,
        channel: dto.channel,
      };
    } catch (error) {
      this.logger.error(`[FollowUp] ERROR: ${error.message}`);
      this.logger.error(`[FollowUp] OpenAI response: ${JSON.stringify(error.response?.data)}`);
      this.logger.error(`[FollowUp] Status: ${error.response?.status}`);
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

  async generateBatchFollowUp(
    userId: string,
    dto: BatchFollowUpDto,
  ): Promise<BatchFollowUpResponseDto> {
    const results: BatchFollowUpResponseDto['results'] = [];

    for (const contactInfo of dto.contacts) {
      try {
        const systemPrompt = this.getSystemPrompt(dto.channel);
        const userPrompt = `Generate a ${dto.channel.toLowerCase()} message to follow up with:

Contact Details:
- Name: ${contactInfo.contactName}
- Title: ${contactInfo.title || 'N/A'}
- Company: ${contactInfo.company || 'N/A'}

Context/Purpose: ${dto.context}

Create a personalized, professional message appropriate for this channel.`;

        const response = await axios.post(
          'https://api.openai.com/v1/responses',
          {
            model: 'gpt-5.2-pro',
            instructions: systemPrompt,
            input: userPrompt,
            reasoning: { effort: 'low' },
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );

        let content = '';
        for (const item of response.data.output) {
          if (item.type === 'message' && item.content) {
            for (const contentItem of item.content) {
              if (contentItem.type === 'output_text') {
                content += contentItem.text;
              }
            }
          }
        }

        const result = this.parseFollowUpResponse(content, dto.channel);
        results.push({
          contactId: contactInfo.contactId,
          contactName: contactInfo.contactName,
          subject: result.subject,
          body: result.body,
          channel: dto.channel,
        });
      } catch (error) {
        this.logger.error(
          `[BatchFollowUp] Error for ${contactInfo.contactName}: ${error.message}`,
        );
        results.push({
          contactId: contactInfo.contactId,
          contactName: contactInfo.contactName,
          subject: undefined,
          body: `Unable to generate message for ${contactInfo.contactName}. Please try again.`,
          channel: dto.channel,
        });
      }
    }

    return { results };
  }
}
