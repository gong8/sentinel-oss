import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface BaseFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

interface InputFieldProps extends BaseFieldProps {
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  register: object;
}

interface TextareaFieldProps extends BaseFieldProps {
  placeholder?: string;
  rows?: number;
  register: object;
}

export function FormInput({
  id,
  label,
  type = 'text',
  placeholder,
  error,
  hint,
  register,
}: InputFieldProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} {...register} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormTextarea({
  id,
  label,
  placeholder,
  rows = 3,
  error,
  hint,
  register,
}: TextareaFieldProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} placeholder={placeholder} rows={rows} {...register} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
