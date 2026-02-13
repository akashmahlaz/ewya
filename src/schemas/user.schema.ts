import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  googleId: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  photoUrl: string;

  @Prop({ default: 'free' })
  subscriptionTier: string;

  @Prop({ default: 0 })
  apiCallsCount: number;

  @Prop({ default: Date.now })
  lastApiCall: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
