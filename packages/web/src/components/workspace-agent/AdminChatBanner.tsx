/**
 * Admin Chat Banner
 * Shows a banner when admin chat visibility is enabled
 */

import { Eye } from 'lucide-react';

export function AdminChatBanner() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-warning-foreground text-sm">
      <Eye className="h-4 w-4 text-warning" />
      <span>Workspace admins may be able to view chat history</span>
    </div>
  );
}
