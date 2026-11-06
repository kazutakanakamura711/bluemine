import {
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isTaskDate', async: false })
export class TaskDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (
      typeof value !== 'string' ||
      !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return false;
    }
    // ISO表記のままUTCで比較し、2月30日などの日付の繰り上がりも拒否する。
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }

  defaultMessage({ property }: ValidationArguments) {
    return `${property}は実在する日付をYYYY-MM-DD形式で指定してください`;
  }
}
