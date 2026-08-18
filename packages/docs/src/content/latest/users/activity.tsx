export default function UserActivityContent() {
  return (
    <>
      <h1 id="viewing-audit">Viewing My Audit Log</h1>
      <p className="lead text-xl text-muted-foreground">
        Track your AI assistant's tool usage history.
      </p>

      <h2 id="audit-log">My Audit Log</h2>
      <p>
        The My Audit Log page shows all tool calls made through your sessions, including timestamps,
        tools used, and decisions.
      </p>

      <h2 id="filtering">Filtering the Audit Log</h2>
      <p>Filter the audit log using the available filters:</p>
      <ul>
        <li>
          <strong>Tool name</strong> - Enter a tool name to filter by specific tools
        </li>
        <li>
          <strong>Decision</strong> - Filter by outcome:
          <ul>
            <li>
              <strong>ALL</strong> - Show all entries
            </li>
            <li>
              <strong>ALLOWED</strong> - Tool calls that were allowed
            </li>
            <li>
              <strong>DENIED</strong> - Tool calls that were denied
            </li>
          </ul>
        </li>
      </ul>

      <h2 id="audit-entries">Audit Entry Details</h2>
      <p>Each entry in the audit log shows information about a tool call, including:</p>
      <ul>
        <li>The tool that was called</li>
        <li>When the call was made</li>
        <li>The decision (ALLOWED or DENIED)</li>
        <li>Which agent made the call</li>
      </ul>

      <h2 id="viewing-details">Viewing Entry Details</h2>
      <p>Click any audit entry to view full details:</p>
      <ul>
        <li>
          <strong>Parameters</strong> - Complete JSON of tool arguments
        </li>
        <li>
          <strong>Justification</strong> - Why the decision was made
        </li>
        <li>
          <strong>Approval Info</strong> (if applicable):
          <ul>
            <li>Approval status (Approved/Denied/Expired)</li>
            <li>Who approved or denied</li>
            <li>When the decision was made</li>
          </ul>
        </li>
      </ul>

      <h2 id="pagination">Pagination</h2>
      <p>
        The audit log displays entries in pages. Use the pagination controls at the bottom of the
        list to navigate through your activity history:
      </p>
      <ul>
        <li>
          <strong>Previous/Next</strong> - Navigate between pages
        </li>
        <li>
          <strong>Page numbers</strong> - Jump directly to a specific page
        </li>
        <li>
          <strong>Items per page</strong> - Adjust how many entries are shown per page
        </li>
      </ul>
    </>
  );
}
