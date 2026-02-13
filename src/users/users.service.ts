import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async create(userData: Partial<User>): Promise<UserDocument> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async updateOrCreate(googleId: string, userData: Partial<User>): Promise<UserDocument> {
    const user = await this.findByGoogleId(googleId);
    if (user) {
      Object.assign(user, userData);
      return user.save();
    }
    return this.create({ googleId, ...userData });
  }

  async incrementApiCallCount(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { apiCallsCount: 1 },
      lastApiCall: new Date(),
    });
  }

  async getApiCallStats(userId: string): Promise<{ count: number; lastCall: Date }> {
    const user = await this.findById(userId);
    return {
      count: user?.apiCallsCount || 0,
      lastCall: user?.lastApiCall || new Date(),
    };
  }
}
