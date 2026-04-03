export interface SelectorOption {
  label: string;
  value: string;
  meta?: Record<string, any>;
}

export class UserSelectorDto implements SelectorOption {
  label: string;
  value: string;
  meta: {
    role?: string;
    department?: string;
    isExternal?: boolean;
  };
}

export class DepartmentSelectorDto implements SelectorOption {
  label: string;
  value: string;
  meta?: undefined;
}
