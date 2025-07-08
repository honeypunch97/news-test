import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { MongoClient, ServerApiVersion, Db } from 'mongodb';

@Injectable()
export class MongoDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDbService.name);
  private client: MongoClient;
  private db: Db;
  private isConnected = false;

  async onModuleInit() {
    this.logger.log('🔄 MongoDB 연결 시작...');

    const uri = process.env.MONGODB_URI;
    const database = process.env.MONGODB_DATABASE || 'news-db';

    if (!uri) {
      this.logger.error('❌ MONGODB_URI 환경 변수가 설정되지 않았습니다.');
      return;
    }

    this.logger.log(`🔗 MongoDB URI: ${uri.replace(/\/\/.*@/, '//***@')}`); // 비밀번호 숨김
    this.logger.log(`📊 데이터베이스: ${database}`);

    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    try {
      this.logger.log('⏳ MongoDB 서버 연결 중...');
      await this.client.connect();

      this.logger.log('🏓 MongoDB 연결 테스트 중...');
      await this.client.db('admin').command({ ping: 1 });

      this.db = this.client.db(database);
      this.isConnected = true;

      this.logger.log('✅ MongoDB 연결 성공!');
      this.logger.log(`📁 사용 중인 데이터베이스: ${database}`);
    } catch (error) {
      this.logger.error('❌ MongoDB 연결 실패:', error.message);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.logger.log('🔌 MongoDB 연결 종료');
    }
  }

  getDatabase(): Db {
    return this.db;
  }

  getClient(): MongoClient {
    return this.client;
  }

  isMongoConnected(): boolean {
    return this.isConnected;
  }
}
