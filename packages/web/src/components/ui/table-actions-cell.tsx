import * as React from 'react';

import { Button } from './button';
import { TableCell } from './table';

interface TableActionsCellProps {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  viewLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function TableActionsCell({
  onView,
  onEdit,
  onDelete,
  viewLabel = 'View',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  disabled,
  children,
}: TableActionsCellProps) {
  return (
    <TableCell className="text-right">
      <div className="flex justify-end gap-2">
        {onView && (
          <Button variant="ghost" size="sm" onClick={onView} disabled={disabled}>
            {viewLabel}
          </Button>
        )}
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} disabled={disabled}>
            {editLabel}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={disabled}
            className="text-destructive hover:text-destructive"
          >
            {deleteLabel}
          </Button>
        )}
        {children}
      </div>
    </TableCell>
  );
}
