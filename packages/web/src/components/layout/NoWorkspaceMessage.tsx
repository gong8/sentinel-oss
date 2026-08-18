import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function NoWorkspaceMessage() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <CardTitle>No Workspace Access</CardTitle>
          <CardDescription>You don&apos;t have access to any workspaces yet.</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Please contact your organization owner to add you to a workspace. Once you have
            workspace access, you&apos;ll be able to manage policies, servers, and other resources.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
