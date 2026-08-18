import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = 'After',
  endLabel = 'Before',
}: DateRangeFilterProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label>Date Range</Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{startLabel}</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{endLabel}</Label>
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
