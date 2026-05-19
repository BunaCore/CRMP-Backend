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

  async searchMembers(query: string, topK: number = 10) {
    try {
      this.logger.debug(`Calling ML API search at ${this.mlApiUrl}/api/search/members`);
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.mlApiUrl}/api/search/members`, {
          query,
          top_k: topK,
        })
      );
      return data;
    } catch (error) {
      this.logger.error(`Failed to search members from ML API: ${error.message}`);
      return { recommendations: [] };
    }
  }

  async recommendProjects(projectMetadata: any, topK: number = 5) {
    try {
      this.logger.debug(`Calling ML API at ${this.mlApiUrl}/api/recommend-projects`);
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.mlApiUrl}/api/recommend-projects`, {
          ...projectMetadata,
          top_k: topK,
        })
      );
      return data;
    } catch (error) {
      this.logger.error(`Failed to get project recommendations from ML API: ${error.message}`);
      return [];
    }
  }

  async searchProjects(query: string, topK: number = 5) {
    try {
      this.logger.debug(`Calling ML API at ${this.mlApiUrl}/api/search-projects`);
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.mlApiUrl}/api/search-projects`, {
          query,
          top_k: topK,
        })
      );
      return data;
    } catch (error) {
      this.logger.error(`Failed to search projects from ML API: ${error.message}`);
      return [];
    }
  }
}
