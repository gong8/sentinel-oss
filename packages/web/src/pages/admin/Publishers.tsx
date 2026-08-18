import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import { z } from 'zod';

import { AdminLayout } from '../../components/layout/AdminLayout';
import { EmptyState } from '../../components/layout/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { TableSkeleton } from '../../components/layout/TableSkeleton';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';
import { formatShortDate } from '../../lib/format';
import { trpc } from '../../lib/trpc';

// Supported key algorithms
const ALGORITHMS = [
  { value: 'RS256', label: 'RS256 (RSA SHA-256)' },
  { value: 'RS384', label: 'RS384 (RSA SHA-384)' },
  { value: 'RS512', label: 'RS512 (RSA SHA-512)' },
  { value: 'ES256', label: 'ES256 (ECDSA P-256)' },
  { value: 'ES384', label: 'ES384 (ECDSA P-384)' },
  { value: 'ES512', label: 'ES512 (ECDSA P-521)' },
  { value: 'EdDSA', label: 'EdDSA (Ed25519)' },
] as const;

const algorithmSchema = z.enum(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA']);

const createPublisherSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  algorithm: algorithmSchema,
  publicKey: z.string().min(50, 'Public key is required'),
});

type CreatePublisherValues = z.infer<typeof createPublisherSchema>;

export default function AdminPublishers() {
  const location = useLocation();
  const utils = trpc.useUtils();

  // Clear navigation state immediately after reading it
  useEffect(() => {
    if (location.state?.openCreateModal) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const publishersQuery = trpc.admin.attestation.listPublishers.useQuery();
  type Publisher = NonNullable<typeof publishersQuery.data>[number];

  const [deleteConfirm, setDeleteConfirm] = useState<Publisher | null>(null);
  const [createOpen, setCreateOpen] = useState(() => {
    return Boolean(location.state?.openCreateModal);
  });

  const createMutation = trpc.admin.attestation.registerPublisher.useMutation({
    onSuccess: () => {
      utils.admin.attestation.listPublishers.invalidate();
      setCreateOpen(false);
      form.reset();
    },
  });

  const deleteMutation = trpc.admin.attestation.deletePublisher.useMutation({
    onSuccess: () => {
      utils.admin.attestation.listPublishers.invalidate();
      setDeleteConfirm(null);
    },
  });

  const form = useForm<CreatePublisherValues>({
    resolver: zodResolver(createPublisherSchema),
    defaultValues: {
      name: '',
      algorithm: 'RS256',
      publicKey: '',
    },
  });

  const handleCreate = form.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id });
  };

  const errors = useMemo(
    () => [publishersQuery.error, createMutation.error, deleteMutation.error].filter(Boolean),
    [publishersQuery.error, createMutation.error, deleteMutation.error],
  );

  const truncateFingerprint = (fingerprint: string) => {
    if (fingerprint.length <= 16) return fingerprint;
    return `${fingerprint.slice(0, 8)}...${fingerprint.slice(-8)}`;
  };

  const formatAlgorithm = (alg: string) => {
    const found = ALGORITHMS.find((a) => a.value === alg);
    return found ? found.label : alg;
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <PageHeader
          title="Publishers"
          description="Register trusted publishers for agent identity verification."
        />

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errors[0]?.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>Register publisher</Button>
        </div>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register publisher</DialogTitle>
              <DialogDescription>
                Register a publisher&apos;s public key for agent signature verification.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label htmlFor="publisher-name">Name</Label>
                <Input
                  id="publisher-name"
                  placeholder="e.g., Anthropic, OpenAI"
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Algorithm</Label>
                <Controller
                  control={form.control}
                  name="algorithm"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select algorithm" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALGORITHMS.map((alg) => (
                          <SelectItem key={alg.value} value={alg.value}>
                            {alg.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.algorithm && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.algorithm.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-key">Public Key (PEM format)</Label>
                <Textarea
                  id="public-key"
                  placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                  rows={8}
                  className="font-mono text-xs"
                  {...form.register('publicKey')}
                />
                {form.formState.errors.publicKey && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.publicKey.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Paste the PEM-encoded public key from the publisher.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Registering...' : 'Register publisher'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Delete publisher</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{' '}
                <span className="font-medium">{deleteConfirm?.name}</span>? Agents signed by this
                publisher will no longer be verified.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Publishers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Registered Publishers</CardTitle>
            <CardDescription>
              Publishers whose signed agents can be verified by this organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {publishersQuery.isPending ? (
              <TableSkeleton />
            ) : publishersQuery.data && publishersQuery.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Algorithm</TableHead>
                    <TableHead>Fingerprint</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publishersQuery.data.map((publisher) => (
                    <TableRow key={publisher.id}>
                      <TableCell className="font-medium">{publisher.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatAlgorithm(publisher.keyAlgorithm)}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {truncateFingerprint(publisher.keyFingerprint)}
                        </code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatShortDate(publisher.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(publisher)}
                          className="text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No publishers registered"
                description="Register a publisher to verify agent signatures."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
