import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import {
  Conversation,
  ConversationDocument,
} from '../schemas/conversation.schema';
import {
  SearchHistory,
  SearchHistoryDocument,
} from '../schemas/search-history.schema';
import { UsersService } from '../users/users.service';
import { ContactsService } from '../contacts/contacts.service';
import { ContactDto } from '../contacts/dto/contact.dto';
import {
  ConversationDto,
  ConversationListItemDto,
  ConversationMessageDto,
} from './dto/conversation.dto';

interface AiProfessional {
  name: string;
  role?: string;
  company?: string;
  location?: string;
  industry?: string;
  relevanceScore?: number;
}

interface AiSearchResult {
  interpretation: string;
  targetProfiles: AiProfessional[];
  searchStrategy: string;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private openaiApiKey: string;
  private rocketreachApiKey: string;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private contactsService: ContactsService,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(SearchHistory.name)
    private searchHistoryModel: Model<SearchHistoryDocument>,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.rocketreachApiKey =
      this.configService.get<string>('ROCKETREACH_API_KEY') || '';
  }

  // ─── Create a new conversation ───────────────────────────────

  async createConversation(userId: string): Promise<ConversationDto> {
    const conversation = new this.conversationModel({
      userId,
      title: 'New Conversation',
      messages: [
        {
          role: 'assistant',
          content:
            "Hello! I'm your AI-powered lead finder. Tell me what kind of professionals or contacts you're looking for, and I'll search for verified contact details.\n\nFor example, try:\n• \"Find real estate agents in Dubai\"\n• \"Tech recruiters in London\"\n• \"Marketing agency founders in NYC\"",
          timestamp: new Date(),
          contacts: [],
          suggestedActions: [
            'Real estate agents in Dubai',
            'Tech recruiters in London',
            'Marketing agencies in NYC',
          ],
        },
      ],
    });

    const saved = await conversation.save();
    return this.mapToDto(saved);
  }

  // ─── Send a message in a conversation (multi-turn) ───────────

  async sendMessage(
    userId: string,
    conversationId: string,
    message: string,
  ): Promise<ConversationDto> {
    const conversation = await this.conversationModel.findOne({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
      contacts: [],
      suggestedActions: [],
    });

    // Update title from first user message
    const userMessageCount = conversation.messages.filter(
      (m) => m.role === 'user',
    ).length;
    if (userMessageCount === 1) {
      conversation.title =
        message.length > 60 ? message.substring(0, 57) + '...' : message;
    }

    // Increment API call count
    await this.usersService.incrementApiCallCount(userId);

    try {
      // Build conversation history for context
      const conversationHistory = conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Step 1: Parse query with AI (with conversation context)
      this.logger.log(`[Conversation] Parsing: "${message}"`);
      const aiResult = await this.parseQueryWithAI(
        message,
        conversationHistory,
      );
      this.logger.log(
        `[Conversation] AI interpretation: ${aiResult.interpretation}`,
      );

      // Step 2: Enrich with RocketReach
      const contacts = await this.enrichContactsWithRocketReach(aiResult);
      this.logger.log(
        `[Conversation] Found ${contacts.length} contacts`,
      );

      // Step 3: Build assistant response
      const assistantContent = this.formatResults(aiResult, contacts);
      const suggestedActions =
        contacts.length > 0
          ? [
              'Send follow-up to all',
              'Save all contacts',
              'Refine search',
              'Export contacts',
            ]
          : ['Try a different search', 'Broaden your criteria'];

      conversation.messages.push({
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        contacts: contacts,
        suggestedActions: suggestedActions,
      });

      conversation.contactCount += contacts.length;

      // Save search history
      await this.saveSearchHistory(userId, message, contacts.length);

      await conversation.save();
      return this.mapToDto(conversation);
    } catch (error) {
      this.logger.error(`[Conversation] Error: ${error.message}`);

      // Add error message to conversation
      conversation.messages.push({
        role: 'assistant',
        content: `I encountered an issue while searching: ${error.message}. Please try again or rephrase your request.`,
        timestamp: new Date(),
        contacts: [],
        suggestedActions: ['Try again', 'Rephrase your search'],
      });

      await conversation.save();
      return this.mapToDto(conversation);
    }
  }

  // ─── List conversations ──────────────────────────────────────

  async getConversations(userId: string): Promise<ConversationListItemDto[]> {
    const conversations = await this.conversationModel
      .find({ userId, isArchived: false })
      .sort({ updatedAt: -1 })
      .limit(50)
      .exec();

    return conversations.map((conv) => {
      const lastMsg =
        conv.messages.length > 0
          ? conv.messages[conv.messages.length - 1]
          : null;

      return {
        id: conv._id.toString(),
        title: conv.title,
        lastMessage: lastMsg?.content?.substring(0, 100) || '',
        contactCount: conv.contactCount,
        followUpCount: conv.followUpCount,
        createdAt: (conv as any).createdAt?.toISOString() || '',
        updatedAt: (conv as any).updatedAt?.toISOString() || '',
      };
    });
  }

  // ─── Get single conversation ─────────────────────────────────

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDto> {
    const conversation = await this.conversationModel.findOne({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    return this.mapToDto(conversation);
  }

  // ─── Delete conversation ─────────────────────────────────────

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const result = await this.conversationModel.deleteOne({
      _id: conversationId,
      userId,
    });
    return result.deletedCount > 0;
  }

  // ─── Archive conversation ────────────────────────────────────

  async archiveConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const result = await this.conversationModel.updateOne(
      { _id: conversationId, userId },
      { isArchived: true },
    );
    return result.modifiedCount > 0;
  }

  // ─── Search history (kept for backward compat) ───────────────

  async getSearchHistory(userId: string): Promise<any[]> {
    const history = await this.searchHistoryModel
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(50)
      .exec();

    return history.map((item) => ({
      id: item._id.toString(),
      query: item.query,
      resultCount: item.resultCount,
      timestamp: item.timestamp,
    }));
  }

  async deleteSearchHistory(
    userId: string,
    historyId: string,
  ): Promise<boolean> {
    const result = await this.searchHistoryModel.deleteOne({
      _id: historyId,
      userId,
    });
    return result.deletedCount > 0;
  }

  async clearSearchHistory(userId: string): Promise<boolean> {
    await this.searchHistoryModel.deleteMany({ userId });
    return true;
  }

  // ─── Private helpers ─────────────────────────────────────────

  private async parseQueryWithAI(
    query: string,
    conversationHistory: { role: string; content: string }[],
  ): Promise<AiSearchResult> {
    const systemPrompt = `You are an AI assistant that helps parse natural language search queries for professional contact search.

Your task is to:
1. Interpret the user's search intent, considering the full conversation context
2. Extract key profile requirements (titles, companies, industries, locations)
3. Return structured JSON data

Important: The user may be refining a previous search. Use the conversation history to understand context.
For example, if the previous search was "real estate agents in Dubai" and the user says "now show me ones in Abu Dhabi", understand they want real estate agents in Abu Dhabi.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "interpretation": "A short phrase describing the search target, e.g. 'real estate agents in Dubai'",
  "targetProfiles": [
    {
      "name": "",
      "role": "job title/role keywords like 'Real Estate Agent'",
      "company": "company name if specified, otherwise empty string",
      "location": "location if specified like 'Dubai, UAE'",
      "industry": "industry if specified like 'Real Estate'",
      "relevanceScore": 95
    }
  ],
  "searchStrategy": "Brief search strategy description"
}

IMPORTANT:
- "interpretation" should be a SHORT noun phrase (not a full sentence)
- Generate 1-3 target profiles with varied role keywords to maximize search results
- Always include location when mentioned
- Always include industry when it can be inferred
- Consider the conversation context for follow-up queries`;

    try {
      // Build input with conversation context
      let input = '';
      if (conversationHistory.length > 1) {
        const recentHistory = conversationHistory.slice(-6); // Last 6 messages for context
        input =
          'Conversation context:\n' +
          recentHistory
            .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
            .join('\n') +
          '\n\nCurrent user query: ' +
          query;
      } else {
        input = query;
      }

      const response = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: 'gpt-5.2-pro',
          instructions: systemPrompt,
          input: input,
          reasoning: { effort: 'medium' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30s timeout
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

      // Strip markdown code fences if present
      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }

      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`[OpenAI] API ERROR: ${error.message}`);
      throw new Error(
        'Failed to parse query with AI: ' +
          (error.response?.data?.error?.message || error.message),
      );
    }
  }

  private async enrichContactsWithRocketReach(
    aiResult: AiSearchResult,
  ): Promise<ContactDto[]> {
    if (!this.rocketreachApiKey) {
      this.logger.warn('[RocketReach] No API key — returning mock data.');
      return aiResult.targetProfiles.map((profile, index) => ({
        id: `mock-${Date.now()}-${index}`,
        name: profile.name || `Professional ${index + 1}`,
        title: profile.role,
        company: profile.company,
        location: profile.location,
        industry: profile.industry,
        emails: [`professional${index + 1}@example.com`],
        phones: [`+1-555-0${100 + index}`],
        linkedInUrl: `https://linkedin.com/in/professional${index + 1}`,
        profileImageUrl: '',
        relevanceScore: profile.relevanceScore || 90,
        summary: `Experienced ${profile.role || 'professional'} at ${profile.company || 'industry-leading company'}`,
        firstName: '',
        lastName: '',
      }));
    }

    try {
      const contacts: ContactDto[] = [];

      for (const profile of aiResult.targetProfiles) {
        try {
          const response = await axios.post(
            'https://api.rocketreach.co/v2/api/search',
            {
              query: {
                current_employer: profile.company
                  ? [profile.company]
                  : undefined,
                current_title: profile.role ? [profile.role] : undefined,
                location: profile.location ? [profile.location] : undefined,
              },
              page_size: 10,
            },
            {
              headers: {
                'Api-Key': this.rocketreachApiKey,
                'Content-Type': 'application/json',
              },
              timeout: 15000, // 15s timeout
            },
          );

          const profiles = response.data.profiles || [];
          const mapped = profiles.map((p: any) =>
            this.mapRocketReachProfile(p),
          );
          contacts.push(...mapped);
        } catch (error) {
          this.logger.error(
            `[RocketReach] Query error: ${error.message}`,
          );
        }
      }

      return contacts;
    } catch (error) {
      this.logger.error(`[RocketReach] Enrichment error: ${error.message}`);
      // Fallback to mock data instead of recursive call (bug fix)
      return aiResult.targetProfiles.map((profile, index) => ({
        id: `fallback-${Date.now()}-${index}`,
        name: profile.name || `Professional ${index + 1}`,
        title: profile.role,
        company: profile.company,
        location: profile.location,
        industry: profile.industry,
        emails: [],
        phones: [],
        linkedInUrl: '',
        profileImageUrl: '',
        relevanceScore: profile.relevanceScore || 50,
        summary: `${profile.role || 'Professional'} at ${profile.company || 'Unknown'}`,
        firstName: '',
        lastName: '',
      }));
    }
  }

  private mapRocketReachProfile(profile: any): ContactDto {
    // RocketReach may return emails/phones as objects [{email, type}, ...] or strings
    const emails = this.extractStringArray(profile.emails || profile.telesign_emails || []);
    const phones = this.extractStringArray(profile.phones || profile.telesign_phones || []);

    return {
      id: profile.id?.toString() || `rr-${Date.now()}-${Math.random()}`,
      name: profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '',
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      title: profile.current_title || profile.title || '',
      company: profile.current_employer || profile.employer || '',
      location: profile.location?.trim() || [profile.city, profile.region, profile.country].filter(Boolean).join(', ') || '',
      industry: profile.industry || '',
      emails,
      phones,
      linkedInUrl: profile.linkedin_url || profile.li_url || '',
      profileImageUrl: profile.profile_pic || profile.photo_url || '',
      relevanceScore: profile.relevance || 90,
      summary: this.buildProfileSummary(profile),
    };
  }

  /**
   * Safely extract string[] from RocketReach data which may be:
   * - string[]: ["email@test.com"]
   * - object[]: [{email: "...", type: "..."}] or [{number: "...", type: "..."}]
   * - null/undefined
   */
  private extractStringArray(data: any): string[] {
    if (!data || !Array.isArray(data)) return [];
    return data
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          // Handle email objects: {email, smtp_valid, type}
          if (item.email) return item.email;
          // Handle phone objects: {number, type}
          if (item.number) return item.number;
          // Handle generic value
          if (item.value) return item.value;
          // Try raw_number for phones
          if (item.raw_number) return item.raw_number;
        }
        return null;
      })
      .filter((v: any): v is string => typeof v === 'string' && v.length > 0);
  }

  private buildProfileSummary(profile: any): string {
    const parts: string[] = [];
    const title = profile.current_title || profile.title || 'Professional';
    const company = profile.current_employer || profile.employer || '';
    const location = profile.location || [profile.city, profile.region].filter(Boolean).join(', ') || '';
    const industry = profile.industry || '';

    parts.push(title);
    if (company) parts.push(`at ${company}`);
    if (location) parts.push(`in ${location}`);
    if (industry) parts.push(`| ${industry}`);

    return parts.join(' ');
  }

  private formatResults(
    aiResult: AiSearchResult,
    contacts: ContactDto[],
  ): string {
    const count = contacts.length;
    if (count === 0) {
      return `I searched for "${aiResult.interpretation}" but couldn't find any matching professionals at the moment. Try refining your search with more specific criteria, or ask me to look in a different location or industry.`;
    }
    return `I found ${count} professional${count > 1 ? 's' : ''} matching "${aiResult.interpretation}". Here are the results with verified contact information:`;
  }

  private async saveSearchHistory(
    userId: string,
    query: string,
    resultCount: number,
  ): Promise<void> {
    const history = new this.searchHistoryModel({
      userId,
      query,
      resultCount,
      timestamp: new Date(),
    });
    await history.save();
  }

  private mapToDto(conversation: ConversationDocument): ConversationDto {
    return {
      id: conversation._id.toString(),
      title: conversation.title,
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp?.toISOString() || '',
        contacts: m.contacts || [],
        suggestedActions: m.suggestedActions || [],
      })),
      contactCount: conversation.contactCount,
      followUpCount: conversation.followUpCount,
      isArchived: conversation.isArchived,
      createdAt: (conversation as any).createdAt?.toISOString() || '',
      updatedAt: (conversation as any).updatedAt?.toISOString() || '',
    };
  }
}
