import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const AUTH_TYPE_OPTIONS = ['NONE', 'OAUTH', 'API_KEY'] as const;
type AuthType = (typeof AUTH_TYPE_OPTIONS)[number];

interface AuthDetectionState {
  status: 'idle' | 'probing' | 'detected' | 'error';
  detectedType: AuthType | null;
  reason: string | null;
  overrideEnabled: boolean;
}

interface AuthTypeSelectProps {
  value: AuthType;
  onChange: (value: AuthType) => void;
  detection: AuthDetectionState;
  onEnableOverride: () => void;
}

export function AuthTypeSelect({
  value,
  onChange,
  detection,
  onEnableOverride,
}: AuthTypeSelectProps): React.ReactElement {
  const isDetectedAndLocked = detection.status === 'detected' && !detection.overrideEnabled;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Auth type</Label>
        {isDetectedAndLocked && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={onEnableOverride}
          >
            Override
          </button>
        )}
      </div>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === 'NONE' || v === 'OAUTH' || v === 'API_KEY') {
            onChange(v);
          }
        }}
        disabled={isDetectedAndLocked}
      >
        <SelectTrigger className={isDetectedAndLocked ? 'opacity-70' : ''}>
          <SelectValue placeholder="Select auth type" />
        </SelectTrigger>
        <SelectContent>
          {AUTH_TYPE_OPTIONS.map((authType) => (
            <SelectItem key={authType} value={authType}>
              {authType}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AuthTypeDetectionStatus detection={detection} onEnableOverride={onEnableOverride} />
    </div>
  );
}

function AuthTypeDetectionStatus({
  detection,
  onEnableOverride,
}: {
  detection: AuthDetectionState;
  onEnableOverride: () => void;
}): React.ReactElement | null {
  if (detection.status === 'probing') {
    return <p className="text-xs text-muted-foreground">Detecting auth type...</p>;
  }

  if (detection.status === 'detected' && detection.reason) {
    return <p className="text-xs text-muted-foreground">Detected: {detection.reason}</p>;
  }

  if (detection.status === 'error' && detection.reason) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">Detection failed: {detection.reason}</p>
        {!detection.overrideEnabled ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Cannot add server: endpoint validation failed.
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={onEnableOverride}
            >
              Override
            </button>
          </div>
        ) : (
          <p className="text-xs text-amber-600">
            Override enabled - you may add server despite validation failure.
          </p>
        )}
      </div>
    );
  }

  return null;
}
