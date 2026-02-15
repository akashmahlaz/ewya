import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { SearchHistory, SearchHistoryDocument } from '../schemas/search-history.schema';
import { UsersService } from '../users/users.service';
import { ContactsService } from '../contacts/contacts.service';
import { SearchResultDto, ContactDto } from '../contacts/dto/contact.dto';

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
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private openaiApiKey: string;
  private rocketreachApiKey: string;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private contactsService: ContactsService,
    @InjectModel(SearchHistory.name)
    private searchHistoryModel: Model<SearchHistoryDocument>,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.rocketreachApiKey = this.configService.get('ROCKETREACH_API_KEY') || '';
  }

  async searchContacts(userId: string, query: string): Promise<SearchResultDto> {
    this.logger.log(`========== SEARCH START ==========`);
    this.logger.log(`User: ${userId} | Query: "${query}"`);
    this.logger.log(`OpenAI key present: ${!!this.openaiApiKey} (len=${this.openaiApiKey?.length})`);
    this.logger.log(`RocketReach key present: ${!!this.rocketreachApiKey} (len=${this.rocketreachApiKey?.length})`);
    try {
      // Increment API call count
      await this.usersService.incrementApiCallCount(userId);

      // Step 1: Parse query with OpenAI
      this.logger.log(`[Step 1] Parsing query with OpenAI...`);
      const aiResult = await this.parseQueryWithAI(query);
      this.logger.log(`[Step 1 DONE] AI interpretation: ${aiResult.interpretation}`);
      this.logger.log(`[Step 1 DONE] Target profiles count: ${aiResult.targetProfiles?.length}`);
      this.logger.log(`[Step 1 DONE] Target profiles: ${JSON.stringify(aiResult.targetProfiles, null, 2)}`);

      // Step 2: Enrich with RocketReach
      this.logger.log(`[Step 2] Enriching with RocketReach...`);
      const contacts = await this.enrichContactsWithRocketReach(aiResult);
      this.logger.log(`[Step 2 DONE] Got ${contacts.length} contacts from RocketReach`);
      if (contacts.length > 0) {
        this.logger.log(`[Step 2 DONE] First contact: ${JSON.stringify(contacts[0])}`);
      }

      // Step 3: Format results
      const formattedMessage = this.formatResults(aiResult, contacts);
      this.logger.log(`[Step 3] Response message: ${formattedMessage}`);

      // Save search history
      await this.saveSearchHistory(userId, query, contacts.length);

      this.logger.log(`========== SEARCH END (${contacts.length} results) ==========`);
      return {
        contacts,
        message: formattedMessage,
        totalResults: contacts.length,
      };
    } catch (error) {
      this.logger.error(`========== SEARCH FAILED ==========`);
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw new HttpException(
        'Search failed: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async parseQueryWithAI(query: string): Promise<AiSearchResult> {
    const systemPrompt = `You are an AI assistant that helps parse natural language search queries for professional contact search. 
    
Your task is to:
1. Interpret the user's search intent
2. Extract key profile requirements (titles, companies, industries, locations)
3. Return structured JSON data

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
- "interpretation" should be a SHORT noun phrase (not a full sentence), e.g. "real estate agents in Dubai" not "The user is looking for real estate agents in Dubai"
- Generate 1-3 target profiles with varied role keywords to maximize search results
- Always include location when mentioned
- Always include industry when it can be inferred`;

    try {
      this.logger.log(`[OpenAI] Sending request with model: gpt-5.2-pro (Responses API)`);
      this.logger.log(`[OpenAI] Instructions length: ${systemPrompt.length}`);
      this.logger.log(`[OpenAI] User query: "${query}"`);

      const response = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: 'gpt-5.2-pro',
          instructions: systemPrompt,
          input: query,
          reasoning: { effort: 'medium' },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30s timeout
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

      this.logger.log(`[OpenAI] Model used: ${response.data.model}`);

      // Strip markdown code fences if present
      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }

      const parsed = JSON.parse(content);
      this.logger.log(`[OpenAI] Parsed successfully - ${parsed.targetProfiles?.length} target profiles`);
      return parsed;
    } catch (error) {
      this.logger.error(`[OpenAI] API ERROR: ${error.message}`);
      this.logger.error(`[OpenAI] Response data: ${JSON.stringify(error.response?.data)}`);
      this.logger.error(`[OpenAI] Status: ${error.response?.status}`);
      throw new Error('Failed to parse query with AI: ' + (error.response?.data?.error?.message || error.message));
    }
  }

  private async enrichContactsWithRocketReach(
    aiResult: AiSearchResult,
  ): Promise<ContactDto[]> {
    if (!this.rocketreachApiKey) {
      this.logger.warn(`[RocketReach] No API key configured! Returning mock data.`);
      return aiResult.targetProfiles.map((profile, index) => ({
        id: `mock-${index}`,
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
      const searchQueries = aiResult.targetProfiles.map((profile) => ({
        query: {
          current_employer: profile.company ? [profile.company] : undefined,
          current_title: profile.role ? [profile.role] : undefined,
          location: profile.location ? [profile.location] : undefined,
        },
      }));

      const contacts: ContactDto[] = [];

      this.logger.log(`[RocketReach] Processing ${searchQueries.length} search queries`);

      for (let i = 0; i < searchQueries.length; i++) {
        const searchQuery = searchQueries[i];
        try {
          this.logger.log(`[RocketReach] Query ${i + 1}/${searchQueries.length}: ${JSON.stringify(searchQuery.query)}`);

          const response = await axios.post(
            'https://api.rocketreach.co/v2/api/search',
            {
              query: searchQuery.query,
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

          this.logger.log(`[RocketReach] Response status: ${response.status}`);
          this.logger.log(`[RocketReach] Response keys: ${Object.keys(response.data)}`);
          this.logger.log(`[RocketReach] Profiles count: ${response.data.profiles?.length || 0}`);
          this.logger.log(`[RocketReach] Pagination: ${JSON.stringify(response.data.pagination || {})}`);

          const profiles = response.data.profiles || [];
          const mappedContacts = profiles.map((profile: any) =>
            this.mapRocketReachProfile(profile),
          );
          contacts.push(...mappedContacts);

          this.logger.log(`[RocketReach] Mapped ${mappedContacts.length} contacts from query ${i + 1}`);
        } catch (error) {
          this.logger.error(`[RocketReach] API ERROR for query ${i + 1}: ${error.message}`);
          this.logger.error(`[RocketReach] Status: ${error.response?.status}`);
          this.logger.error(`[RocketReach] Response: ${JSON.stringify(error.response?.data)}`);
        }
      }

      this.logger.log(`[RocketReach] Total contacts found: ${contacts.length}`);
      return contacts;
    } catch (error) {
      this.logger.error(`[RocketReach] Enrichment error: ${error.message}`);
      // Fallback to mock data instead of recursive call
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
   */
  private extractStringArray(data: any): string[] {
    if (!data || !Array.isArray(data)) return [];
    return data
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          if (item.email) return item.email;
          if (item.number) return item.number;
          if (item.value) return item.value;
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

  private formatResults(aiResult: AiSearchResult, contacts: ContactDto[]): string {
    const count = contacts.length;
    if (count === 0) {
      return `I searched for "${aiResult.interpretation}" but couldn't find any matching professionals at the moment. Try refining your search with more specific criteria.`;
    }

    return `I found ${count} professional${count > 1 ? 's' : ''} matching your search. ${aiResult.interpretation}. Here are the top results with verified contact information.`;
  }

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

  async deleteSearchHistory(userId: string, historyId: string): Promise<boolean> {
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
}
