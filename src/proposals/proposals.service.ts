import { Injectable } from '@nestjs/common';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class ProposalsService {
    async create(user: any, dto: CreateProposalDto, file: Express.Multer.File) {
        // This will be implemented in Step 3
        console.log('Received Payload:', dto);
        console.log('Received File:', file?.originalname);
        return {
            message: 'Processing proposal...',
            data: {
                title: dto.title,
                submittedBy: user.fullName,
            },
        };
    }
}
