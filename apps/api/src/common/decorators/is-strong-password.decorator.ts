import { registerDecorator, ValidationOptions } from 'class-validator';

// Same policy enforced client-side on every "create a password" screen (customer/rider register,
// admin create-staff-user) — kept here as the real, unbypassable check, since the frontend one is
// only ever a UX convenience.
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Password must include an uppercase letter, a lowercase letter, a number, and a special character',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && STRONG_PASSWORD_REGEX.test(value);
        },
      },
    });
  };
}
