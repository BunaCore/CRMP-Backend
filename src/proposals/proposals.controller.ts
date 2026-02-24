import {
    Controller,
    Post,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequirePermission } from 'src/access-control/require-permission.decorator';
import { Permission } from 'src/access-control/permission.enum';

@Controller('proposals')
@UseGuards(JwtAuthGuard, AccessGuard) // 🛡️ Execution order: 1. Auth, 2. Permissions
export class ProposalsController {
    constructor(private readonly proposalsService: ProposalsService) { }

    @Post()
    @RequirePermission(Permission.PROJECT_CREATE) // 🔒 Only roles with this permission can enter
    @UseInterceptors(FileInterceptor('file')) // 📂 Capture the PDF
    async submitProposal(
        @Body() createProposalDto: CreateProposalDto,
        @CurrentUser() user: any,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
                    new FileTypeValidator({ fileType: 'application/pdf' }), // PDF only
                ],
            }),
        )
        file: Express.Multer.File,
    ) {
        return this.proposalsService.create(user, createProposalDto, file);
    }
}
