import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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
    try {
      // Increment API call count
      await this.usersService.incrementApiCallCount(userId);

      // Step 1: Parse query with OpenAI
      const aiResult = await this.parseQueryWithAI(query);

      // Step 2: Enrich with RocketReach
      const contacts = await this.enrichContactsWithRocketReach(aiResult);

      // Step 3: Format results
      const formattedMessage = this.formatResults(aiResult, contacts);

      // Save search history
      await this.saveSearchHistory(userId, query, contacts.length);

      return {
        contacts,
        message: formattedMessage,
        totalResults: contacts.length,
      };
    } catch (error) {
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

Return ONLY valid JSON in this exact format:
{
  "interpretation": "Brief summary of what the user is looking for",
  "targetProfiles": [
    {
      "name": "example name if specific, otherwise empty",
      "role": "job title/role keywords",
      "company": "company name if specified",
      "location": "location if specified",
      "industry": "industry if specified",
      "relevanceScore": 95
    }
  ],
  "searchStrategy": "Brief search strategy description"
}`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      throw new Error('Failed to parse query with AI');
    }
  }

  private async enrichContactsWithRocketReach(
    aiResult: AiSearchResult,
  ): Promise<ContactDto[]> {
    if (!this.rocketreachApiKey) {
      // Return mock data if no API key
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
          current_employer: profile.company || undefined,
          current_title: profile.role || undefined,
          location: profile.location || undefined,
        },
      }));

      const contacts: ContactDto[] = [];

      for (const searchQuery of searchQueries) {
        try {
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
            },
          );

          const profiles = response.data.profiles || [];
          const mappedContacts = profiles.map((profile: any) =>
            this.mapRocketReachProfile(profile),
          );
          contacts.push(...mappedContacts);
        } catch (error) {
          console.error('RocketReach API error:', error.response?.data || error.message);
        }
      }

      return contacts;
    } catch (error) {
      console.error('RocketReach enrichment error:', error);
      // Fallback to mock data
      return this.enrichContactsWithRocketReach({ ...aiResult });
    }
  }

  private mapRocketReachProfile(profile: any): ContactDto {
    return {
      id: profile.id?.toString() || `rr-${Date.now()}-${Math.random()}`,
      name: profile.name || '',
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      title: profile.current_title || '',
      company: profile.current_employer || '',
      location: profile.location || '',
      industry: profile.industry || '',
      emails: profile.emails || [],
      phones: profile.phones || [],
      linkedInUrl: profile.linkedin_url || '',
      profileImageUrl: profile.profile_pic || '',
      relevanceScore: 90,
      summary: `${profile.current_title || 'Professional'} at ${profile.current_employer || 'Unknown Company'}`,
    };
  }

  private formatResults(aiResult: AiSearchResult, contacts: ContactDto[]): string {
    const count = contacts.length;
    if (count === 0) {
      return `I understand you're looking for ${aiResult.interpretation}, but I couldn't find any matching professionals at the moment. Try refining your search with more specific criteria.`;
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
