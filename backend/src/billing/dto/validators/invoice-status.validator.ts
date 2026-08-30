import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

const VALID_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'];

@ValidatorConstraint({ async: false })
export class IsValidInvoiceStatusConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    return VALID_STATUSES.includes(value);
  }
}

export function IsValidInvoiceStatus(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidInvoiceStatusConstraint,
    });
  };
}
