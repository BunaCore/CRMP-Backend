import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { flattenErrors } from './flatten-validation-errors';

export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException({
    statusCode: 400,
    message: 'Validation failed',
    errors: flattenErrors(errors),
  });
}
