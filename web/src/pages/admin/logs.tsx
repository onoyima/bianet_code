import { useState } from "react";
import {
  useAdminGetLogs,
  getAdminGetLogsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Info,
  Download,
} from "lucide-react";

const ACTION_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  KYC_APPROVED:   { variant: "default",     label: "KYC Approved"   },
  KYC_REJECTED:   { variant: "destructive", label: "KYC Rejected"   },
  USER_SUSPENDED: { variant: "destructive", label: "User Suspended"  },
  USER_RESTORED:  { variant: "secondary",   label: "User Restored"   },
  ARBITRATION:    { variant: "outline",     label: "Arbitration"     },
  LOGIN:          { variant: "outline",     label: "Admin Login"     },
};

const RESULT_ICON = {
  SUCCESS: <CheckCircle2 className="h-4 w-4 text-primary" />,
  FAILURE: <XCircle className="h-4 w-4 text-destructive" />,
};

export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  const params = {
    page,
    limit: 25,
    ...(actionFilter !== "ALL" ? { action: actionFilter } : {}),
  };

  const { data, isLoading } = useAdminGetLogs(params, {
    query: { queryKey: getAdminGetLogsQueryKey(params) },
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 1;

  const filtered = search.trim()
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          l.adminId.includes(search) ||
          l.entityId?.includes(search) ||
          l.notes?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Audit Log
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const token = sessionStorage.getItem("accessToken");
                const params = new URLSearchParams();
                if (actionFilter !== "ALL") params.set("action", actionFilter);
                const url = `/api/v1/admin/logs/export/csv${params.toString() ? "?" + params.toString() : ""}`;
                fetch(url, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `audit-log-${Date.now()}.csv`;
                    a.click();
                  })
                  .catch(() => {});
              }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <CardDescription>
            Immutable record of all admin actions on the platform. Entries cannot be edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search actions, admin IDs, entity IDs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-log-search"
              />
            </div>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-52" data-testid="select-action-filter">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                <SelectItem value="KYC_APPROVED">KYC Approved</SelectItem>
                <SelectItem value="KYC_REJECTED">KYC Rejected</SelectItem>
                <SelectItem value="USER_SUSPENDED">User Suspended</SelectItem>
                <SelectItem value="USER_RESTORED">User Restored</SelectItem>
                <SelectItem value="ARBITRATION">Arbitration</SelectItem>
                <SelectItem value="LOGIN">Admin Login</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>{search ? "No logs match this search." : "No audit logs recorded yet."}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-44">Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => {
                    const badge = ACTION_BADGE[log.action];
                    return (
                      <TableRow key={log.id} className="text-sm" data-testid={`row-log-${log.id}`}>
                        <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                          {new Date((log as any).createdAt ?? Date.now()).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {badge ? (
                            <Badge variant={badge.variant} className="text-xs whitespace-nowrap">
                              {badge.label}
                            </Badge>
                          ) : (
                            <span className="text-xs font-mono text-foreground">{log.action}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground" data-testid={`text-admin-${log.id}`}>
                            {log.adminId.substring(0, 8)}…
                          </span>
                        </TableCell>
                        <TableCell>
                          {log.entityType || log.entityId ? (
                            <span className="text-xs text-muted-foreground">
                              {log.entityType && <span className="text-foreground font-medium mr-1">{log.entityType}</span>}
                              {log.entityId && <span className="font-mono">{log.entityId.substring(0, 8)}…</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.result
                            ? <div className="flex items-center gap-1">{RESULT_ICON[log.result as keyof typeof RESULT_ICON] ?? <span className="text-xs">{log.result}</span>}</div>
                            : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {log.notes ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="text-muted-foreground hover:text-foreground" data-testid={`button-log-notes-${log.id}`}>
                                  <Info className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs text-xs">
                                {log.notes}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {meta && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {meta.total} log entr{meta.total !== 1 ? "ies" : "y"} — page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
