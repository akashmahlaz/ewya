import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SearchHistoryDocument = SearchHistory & Document;

@Schema({ timestamps: true })
export class SearchHistory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  query: string;

  @Prop({ default: 0 })
  resultCount: number;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

export const SearchHistorySchema = SchemaFactory.createForClass(SearchHistory);

// Create index for efficient querying
SearchHistorySchema.index({ userId: 1, timestamp: -1 });
