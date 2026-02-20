import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../jwt.guard';

export const Auth = () => UseGuards(JwtAuthGuard);
