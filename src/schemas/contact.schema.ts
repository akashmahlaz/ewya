import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  contactId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  title: string;

  @Prop()
  company: string;

  @Prop()
  location: string;

  @Prop()
  industry: string;

  @Prop({ type: [String], default: [] })
  emails: string[];

  @Prop({ type: [String], default: [] })
  phones: string[];

  @Prop()
  linkedInUrl: string;

  @Prop()
  profileImageUrl: string;

  @Prop({ default: 0 })
  relevanceScore: number;

  @Prop()
  summary: string;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

// Create index for efficient querying
ContactSchema.index({ userId: 1, contactId: 1 }, { unique: true });
ContactSchema.index({ userId: 1, createdAt: -1 });
