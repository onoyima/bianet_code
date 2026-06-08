import { useState } from "react";
import {
  useAdminListUsers,
  useAdminSuspendUser,
  getAdminListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@workspace/api-client-react";

const ROLE_COLORS: Record<string, string> = {
  ADMIN:             "bg-destructive/10 text-destructive border-destructive/20",
  FARMER:            "bg-primary/10 text-primary border-primary/20",
  TRADER:            "bg-secondary/10 text-secondary border-secondary/20",
  EXPORTER:          "bg-secondary/15 text-secondary border-secondary/25",
  IMPORTER:          "bg-muted text-muted-foreground border-border",
  CONSUMER:          "bg-muted text-muted-foreground border-border",
  LOGISTICS_PROVIDER:"bg-accent/10 text-accent-foreground border-accent/20",
};

export default function AdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [actionTarget, setActionTarget] = useState<UserProfile | null>(null);
  const [actionType, setActionType] = useState<"suspend" | "restore" | null>(null);
  const [reason, setReason] = useState("");

  const params = {
    page,
    limit: 20,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(roleFilter !== "ALL" ? { role: roleFilter } : {}),
  };

  const { data, isLoading } = useAdminListUsers(params, {
    query: { queryKey: getAdminListUsersQueryKey(params) },
  });

  const suspendMutation = useAdminSuspendUser();

  const openAction = (user: UserProfile, type: "suspend" | "restore") => {
    setActionTarget(user);
    setActionType(type);
    setReason("");
  };

  const handleAction = async () => {
    if (!actionTarget || !actionType) return;
    if (actionType === "suspend" && reason.trim().length < 5) {
      toast({ title: "Reason required", description: "Provide a reason (min 5 characters) for suspension.", variant: "destructive" });
      return;
    }
    try {
      await suspendMutation.mutateAsync({
        id: actionTarget.id,
        data: { isActive: actionType === "restore", reason: reason.trim() || null },
      });
      toast({
        title: actionType === "suspend" ? "User suspended" : "User restored",
        description: `${actionTarget.firstName ?? actionTarget.phone} has been ${actionType === "suspend" ? "suspended" : "restored"}.`,
      });
      setActionTarget(null);
      setActionType(null);
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey(params) });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  };

  const users = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>Search, filter, and manage platform accounts. Suspended users cannot log in or transact.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, phone or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-user-search"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44" data-testid="select-role-filter">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All roles</SelectItem>
                <SelectItem value="FARMER">Farmer</SelectItem>
                <SelectItem value="TRADER">Trader</SelectItem>
                <SelectItem value="EXPORTER">Exporter</SelectItem>
                <SelectItem value="IMPORTER">Importer</SelectItem>
                <SelectItem value="CONSUMER">Consumer</SelectItem>
                <SelectItem value="LOGISTICS_PROVIDER">Logistics</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>No users match this filter.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>KYC</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.phone}</p>
                          {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${ROLE_COLORS[user.role] ?? "bg-muted text-muted-foreground"}`} data-testid={`text-role-${user.id}`}>
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.kycStatus === "APPROVED" ? "default" : user.kycStatus === "REJECTED" ? "destructive" : "outline"}
                          className="text-xs"
                          data-testid={`badge-kyc-${user.id}`}
                        >
                          {user.kycStatus ?? "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.isActive
                          ? <Badge variant="secondary" className="text-xs">Active</Badge>
                          : <Badge variant="destructive" className="text-xs">Suspended</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.role !== "ADMIN" && (
                          user.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openAction(user, "suspend")}
                              data-testid={`button-suspend-${user.id}`}
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Suspend
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => openAction(user, "restore")}
                              data-testid={`button-restore-${user.id}`}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {meta && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {meta.total} user{meta.total !== 1 ? "s" : ""} — page {page} of {totalPages}
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

      <Dialog open={!!actionTarget} onOpenChange={(open) => { if (!open) { setActionTarget(null); setActionType(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {actionType === "suspend" ? "Suspend User" : "Restore User"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "suspend"
                ? `Suspending ${actionTarget?.firstName ?? actionTarget?.phone} will immediately revoke their access. All active sessions will be terminated.`
                : `Restoring ${actionTarget?.firstName ?? actionTarget?.phone} will re-enable their account access.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="action-reason">
              {actionType === "suspend" ? "Reason for suspension" : "Notes (optional)"}
            </Label>
            <Textarea
              id="action-reason"
              className="mt-2"
              placeholder={actionType === "suspend" ? "State the reason clearly (required)..." : "Optional notes..."}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="textarea-action-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionTarget(null); setActionType(null); }}>Cancel</Button>
            <Button
              variant={actionType === "suspend" ? "destructive" : "default"}
              onClick={handleAction}
              disabled={suspendMutation.isPending}
              data-testid="button-action-confirm"
            >
              {suspendMutation.isPending
                ? "Processing..."
                : actionType === "suspend" ? "Suspend Account" : "Restore Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
