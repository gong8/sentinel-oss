import { useState } from 'react';

import { SettingsPageLayout } from '../../../components/layout/SettingsPageLayout';
import { TableSkeleton } from '../../../components/layout/TableSkeleton';
import { SettingsCard, SettingsDivider } from '../../../components/settings/SettingsCard';
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { useWorkspace } from '../../../hooks/WorkspaceContext';
import { formatRelativeTime, formatShortDate } from '../../../lib/format';
import { trpc } from '../../../lib/trpc';

export default function SettingsOrgOwners() {
  const utils = trpc.useUtils();
  const { isOrgOwner } = useWorkspace();

  // Queries
  const ownersQuery = trpc.admin.orgOwners.list.useQuery();
  const usersQuery = trpc.admin.users.list.useQuery();
  const incomingTransfersQuery = trpc.admin.ownershipTransfer.getPendingIncoming.useQuery();
  const outgoingTransfersQuery = trpc.admin.ownershipTransfer.getPendingOutgoing.useQuery(
    undefined,
    { enabled: isOrgOwner },
  );

  // Mutations
  const addOwnerMutation = trpc.admin.orgOwners.add.useMutation({
    onSuccess: () => {
      utils.admin.orgOwners.list.invalidate();
      setAddOwnerOpen(false);
      setSelectedUserId('');
    },
  });

  const removeOwnerMutation = trpc.admin.orgOwners.remove.useMutation({
    onSuccess: () => {
      utils.admin.orgOwners.list.invalidate();
      setRemoveConfirm(null);
    },
  });

  const initiateTransferMutation = trpc.admin.ownershipTransfer.initiate.useMutation({
    onSuccess: () => {
      utils.admin.ownershipTransfer.getPendingOutgoing.invalidate();
      setTransferOpen(false);
      setTransferUserId('');
    },
  });

  const acceptTransferMutation = trpc.admin.ownershipTransfer.accept.useMutation({
    onSuccess: () => {
      utils.admin.ownershipTransfer.getPendingIncoming.invalidate();
      utils.admin.orgOwners.list.invalidate();
      utils.user.profile.get.invalidate();
    },
  });

  const declineTransferMutation = trpc.admin.ownershipTransfer.decline.useMutation({
    onSuccess: () => {
      utils.admin.ownershipTransfer.getPendingIncoming.invalidate();
    },
  });

  const cancelTransferMutation = trpc.admin.ownershipTransfer.cancel.useMutation({
    onSuccess: () => {
      utils.admin.ownershipTransfer.getPendingOutgoing.invalidate();
    },
  });

  // State
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState<{ userId: string; email: string } | null>(
    null,
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState('');

  // Derived data
  const owners = ownersQuery.data ?? [];
  const ownerUserIds = new Set(owners.map((o) => o.userId));
  const availableUsersToAdd = usersQuery.data?.filter((u) => !ownerUserIds.has(u.id)) ?? [];
  const availableUsersForTransfer = usersQuery.data?.filter((u) => !ownerUserIds.has(u.id)) ?? [];

  const incomingTransfers = incomingTransfersQuery.data ?? [];
  const outgoingTransfers = outgoingTransfersQuery.data ?? [];

  const isLastOwner = owners.length <= 1;

  function handleAddOwner() {
    if (!selectedUserId) return;
    addOwnerMutation.mutate({ userId: selectedUserId });
  }

  function handleRemoveOwner() {
    if (!removeConfirm) return;
    removeOwnerMutation.mutate({ userId: removeConfirm.userId });
  }

  function handleInitiateTransfer() {
    if (!transferUserId) return;
    initiateTransferMutation.mutate({ toUserId: transferUserId });
  }

  if (ownersQuery.isPending) {
    return (
      <SettingsPageLayout>
        <div className="space-y-6">
          <SettingsCard title="Organization Owners" description="Loading...">
            <TableSkeleton />
          </SettingsCard>
        </div>
      </SettingsPageLayout>
    );
  }

  if (ownersQuery.error) {
    return (
      <SettingsPageLayout>
        <Alert variant="destructive">
          <AlertTitle>Failed to load organization owners</AlertTitle>
          <AlertDescription>{ownersQuery.error.message}</AlertDescription>
        </Alert>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <div className="space-y-6">
        {/* Organization Owners Section */}
        <SettingsCard
          title="Organization Owners"
          description="Org owners have full administrative access and can manage all aspects of the organization."
          actions={
            isOrgOwner && (
              <Button size="sm" onClick={() => setAddOwnerOpen(true)}>
                Add Owner
              </Button>
            )
          }
        >
          {owners.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No organization owners found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Added By</TableHead>
                  {isOrgOwner && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.map((owner) => (
                  <TableRow key={owner.id}>
                    <TableCell className="font-medium">{owner.user.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatShortDate(owner.addedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {owner.addedByUser?.email ?? 'Initial owner'}
                    </TableCell>
                    {isOrgOwner && (
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  disabled={isLastOwner}
                                  onClick={() =>
                                    setRemoveConfirm({
                                      userId: owner.userId,
                                      email: owner.user.email,
                                    })
                                  }
                                >
                                  Remove
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {isLastOwner && (
                              <TooltipContent>
                                Cannot remove the last organization owner
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SettingsCard>

        {/* Ownership Transfers Section - Only visible to org owners or users with pending incoming transfers */}
        {(isOrgOwner || incomingTransfers.length > 0) && (
          <SettingsCard
            title="Ownership Transfers"
            description="Transfer ownership to another user or accept pending transfers."
            actions={
              isOrgOwner && (
                <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
                  Transfer Ownership
                </Button>
              )
            }
          >
            {/* Pending Incoming Transfers */}
            {incomingTransfers.length > 0 && (
              <>
                <div className="py-4">
                  <h4 className="text-sm font-medium mb-3">Pending Incoming Transfers</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Accept to become an organization owner.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>Initiated</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomingTransfers.map((transfer) => (
                        <TableRow key={transfer.id}>
                          <TableCell className="font-medium">
                            {transfer.fromUser?.email ?? 'Unknown'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatShortDate(transfer.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {formatRelativeTime(transfer.expiresAt)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  acceptTransferMutation.mutate({ transferId: transfer.id })
                                }
                                disabled={acceptTransferMutation.isPending}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  declineTransferMutation.mutate({ transferId: transfer.id })
                                }
                                disabled={declineTransferMutation.isPending}
                              >
                                Decline
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {isOrgOwner && outgoingTransfers.length > 0 && <SettingsDivider />}
              </>
            )}

            {/* Pending Outgoing Transfers - Only for org owners */}
            {isOrgOwner && outgoingTransfers.length > 0 && (
              <div className="py-4">
                <h4 className="text-sm font-medium mb-3">Pending Outgoing Transfers</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Transfers you have initiated that are awaiting acceptance.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>To</TableHead>
                      <TableHead>Initiated</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outgoingTransfers.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell className="font-medium">
                          {transfer.toUser?.email ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatShortDate(transfer.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {formatRelativeTime(transfer.expiresAt)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() =>
                              cancelTransferMutation.mutate({ transferId: transfer.id })
                            }
                            disabled={cancelTransferMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Empty state */}
            {incomingTransfers.length === 0 && (!isOrgOwner || outgoingTransfers.length === 0) && (
              <p className="text-sm text-muted-foreground py-4">No pending transfers.</p>
            )}
          </SettingsCard>
        )}

        {/* Add Owner Dialog */}
        <Dialog open={addOwnerOpen} onOpenChange={setAddOwnerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Organization Owner</DialogTitle>
              <DialogDescription>
                Select a user to grant organization owner privileges. Owners have full
                administrative access.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsersToAdd.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No users available
                    </SelectItem>
                  ) : (
                    availableUsersToAdd.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {addOwnerMutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{addOwnerMutation.error.message}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOwnerOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddOwner}
                disabled={!selectedUserId || addOwnerMutation.isPending}
              >
                {addOwnerMutation.isPending ? 'Adding...' : 'Add Owner'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Owner Confirmation Dialog */}
        <Dialog open={Boolean(removeConfirm)} onOpenChange={() => setRemoveConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Organization Owner</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove <strong>{removeConfirm?.email}</strong> as an
                organization owner? They will lose full administrative access.
              </DialogDescription>
            </DialogHeader>

            {removeOwnerMutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{removeOwnerMutation.error.message}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveOwner}
                disabled={removeOwnerMutation.isPending}
              >
                {removeOwnerMutation.isPending ? 'Removing...' : 'Remove Owner'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Ownership Dialog */}
        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transfer Ownership</DialogTitle>
              <DialogDescription>
                Send an ownership transfer request to another user. They will need to accept the
                transfer to become an organization owner.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Select value={transferUserId} onValueChange={setTransferUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsersForTransfer.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No users available
                    </SelectItem>
                  ) : (
                    availableUsersForTransfer.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {initiateTransferMutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{initiateTransferMutation.error.message}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInitiateTransfer}
                disabled={!transferUserId || initiateTransferMutation.isPending}
              >
                {initiateTransferMutation.isPending ? 'Sending...' : 'Send Transfer Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsPageLayout>
  );
}
