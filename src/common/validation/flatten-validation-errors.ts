// src/common/validation/flatten-validation-errors.ts
import { ValidationError } from 'class-validator';

export function flattenErrors(
  errors: ValidationError[],
  parentPath = '',
): { field: string; message: string }[] {
  const result: { field: string; message: string }[] = [];

  for (const error of errors) {
    const currentPath = parentPath
      ? isNaN(Number(error.property))
        ? `${parentPath}.${error.property}`
        : `${parentPath}[${error.property}]`
      : error.property;

    if (error.constraints) {
      for (const msg of Object.values(error.constraints)) {
        result.push({
          field: currentPath,
          message: msg,
        });
      }
    }

    if (error.children?.length) {
      result.push(...flattenErrors(error.children, currentPath));
    }
  }

  return result;
}
