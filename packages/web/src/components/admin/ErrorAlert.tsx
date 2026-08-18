import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface ErrorAlertProps {
  /** Title for the error alert */
  title?: string;
  /** Array of error objects with message property */
  errors: Array<{ message: string }>;
}

export function ErrorAlert({
  title = 'Error',
  errors,
}: ErrorAlertProps): React.ReactElement | null {
  if (errors.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errors[0]?.message}</AlertDescription>
    </Alert>
  );
}
