import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  private readonly mlApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.mlApiUrl = this.configService.get<string>('ML_API_URL', 'http://localhost:8001');
  }

  async recommendMembers(params: any) {
    try {
      this.logger.debug(`Calling ML API at ${this.mlApiUrl}/api/recommend-members`);
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.mlApiUrl}/api/recommend-members`, params)
      );
      return data;
    } catch (error) {
      this.logger.error(`Failed to get recommendations from ML API: ${error.message}`);
      throw error;
    }
  }
}
