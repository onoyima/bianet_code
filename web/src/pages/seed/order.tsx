import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetEscrow,
  useConfirmSeedDelivery,
  useDisputeSeedOrder,
  getGetEscrowQueryKey,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle2, Clock, Ban } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "Pending Payment", variant: "outline", icon: Clock },
  funded: { label: "Funded — Awaiting Delivery", variant: "secondary", icon: ShieldCheck },
  released: { label: "Completed", variant: "default", icon: CheckCircle2 },
  refunded: { label: "Refunded", variant: "outline", icon: Ban },
  disputed: { label: "Under Dispute", variant: "destructive", icon: AlertTriangle },
  resolved: { label: "Resolved", variant: "default", icon: CheckCircle2 },
};

export default function SeedOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: escrow, isLoading } = useGetEscrow(id!, {
    query: { enabled: !!id, queryKey: getGetEscrowQueryKey(id!) },
  });

  const confirmMutation = useConfirmSeedDelivery();
  const disputeMutation = useDisputeSeedOrder();

  const [confirmPin, setConfirmPin] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const handleConfirm = async () => {
    if (!confirmPin || confirmPin.length < 4) {
      toast({ title: "PIN required", description: "Enter your 4–6 digit transaction PIN.", variant: "destructive" });
      return;
    }
    if (!confirmCode) {
      toast({ title: "Verification code required", description: "Enter the delivery verification code from your seller.", variant: "destructive" });
      return;
    }
    try {
      await confirmMutation.mutateAsync({
        id: id!,
        data: { pin: confirmPin, verificationCode: confirmCode },
      });
      toast({ title: "Delivery confirmed", description: "Payment has been released to the seller." });
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetEscrowQueryKey(id!) });
    } catch (err: any) {
      toast({ title: "Confirmation failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  };

  const handleDispute = async () => {
    if (disputeReason.trim().length < 20) {
      toast({ title: "Reason too short", description: "Please describe the issue in at least 20 characters.", variant: "destructive" });
      return;
    }
    try {
      await disputeMutation.mutateAsync({
        id: id!,
        data: { reason: disputeReason.trim() },
      });
      toast({ title: "Dispute raised", description: "Our team will review and mediate within 24–48 hours." });
      setDisputeOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetEscrowQueryKey(id!) });
    } catch (err: any) {
      toast({ title: "Failed to raise dispute", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h2 className="text-xl font-semibold">Order not found</h2>
        <p className="text-muted-foreground mt-2 text-sm">This order may have been removed or you may not have permission to view it.</p>
        <Link href="/seed" className="text-primary hover:underline mt-6 inline-block text-sm">Back to Marketplace</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[escrow.status] ?? { label: escrow.status, variant: "outline" as const, icon: Clock };
  const StatusIcon = statusCfg.icon;
  const canConfirm = escrow.status === "funded";
  const canDispute = escrow.status === "funded";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/seed" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-seed">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Seed Marketplace
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-order-id">
            Order #{escrow.id.substring(0, 8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Escrow-backed produce order</p>
        </div>
        <Badge variant={statusCfg.variant} className="flex items-center gap-1.5 text-sm px-3 py-1.5" data-testid="status-order">
          <StatusIcon className="h-4 w-4" />
          {statusCfg.label}
        </Badge>
      </div>

      {escrow.status === "disputed" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dispute in progress</AlertTitle>
          <AlertDescription>
            A dispute has been raised on this order. Our arbitration team will contact both parties within 24–48 hours. Funds are held securely in escrow until resolution.
          </AlertDescription>
        </Alert>
      )}

      {escrow.status === "released" && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Order complete</AlertTitle>
          <AlertDescription>Delivery was confirmed and funds have been released to the seller.</AlertDescription>
        </Alert>
      )}

      <Card data-testid="card-escrow-details">
        <CardHeader>
          <CardTitle>Escrow Summary</CardTitle>
          <CardDescription>Financial details secured in escrow</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <div>
              <dt className="text-muted-foreground">Gross Amount</dt>
              <dd className="font-semibold text-lg mt-1">
                {escrow.currency ?? "NGN"} {Number(escrow.amount).toLocaleString()}
              </dd>
            </div>
            {escrow.platformCommission && (
              <div>
                <dt className="text-muted-foreground">Platform Commission</dt>
                <dd className="font-medium mt-1">{escrow.currency ?? "NGN"} {Number(escrow.platformCommission).toLocaleString()}</dd>
              </div>
            )}
            {escrow.logisticsFee && (
              <div>
                <dt className="text-muted-foreground">Logistics Fee</dt>
                <dd className="font-medium mt-1">{escrow.currency ?? "NGN"} {Number(escrow.logisticsFee).toLocaleString()}</dd>
              </div>
            )}
            {escrow.netSellerPayout && (
              <div>
                <dt className="text-muted-foreground">Net Seller Payout</dt>
                <dd className="font-semibold mt-1 text-primary">{escrow.currency ?? "NGN"} {Number(escrow.netSellerPayout).toLocaleString()}</dd>
              </div>
            )}
            <Separator className="sm:col-span-2" />
            <div>
              <dt className="text-muted-foreground">Platform</dt>
              <dd className="font-medium mt-1 capitalize">{escrow.platform}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payment Provider</dt>
              <dd className="font-medium mt-1">{escrow.paymentProvider ?? "—"}</dd>
            </div>
            {escrow.depositedAt && (
              <div>
                <dt className="text-muted-foreground">Funded At</dt>
                <dd className="font-medium mt-1">{new Date(escrow.depositedAt).toLocaleString()}</dd>
              </div>
            )}
            {escrow.releasedAt && (
              <div>
                <dt className="text-muted-foreground">Released At</dt>
                <dd className="font-medium mt-1">{new Date(escrow.releasedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 bg-secondary/10 border border-secondary/20 rounded-lg p-4">
        <ShieldCheck className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
        <p className="text-sm text-secondary-foreground">
          Funds are held in escrow and will only be released when you confirm successful delivery. If there is a problem, raise a dispute and our team will arbitrate.
        </p>
      </div>

      {(canConfirm || canDispute) && (
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {canConfirm && (
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1 h-11" data-testid="button-confirm-delivery">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm Delivery
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Receipt of Goods</DialogTitle>
                  <DialogDescription>
                    Only confirm if you have physically received and inspected the goods. This action releases funds to the seller and cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="confirm-code">Delivery Verification Code</Label>
                    <Input
                      id="confirm-code"
                      placeholder="Enter code from seller"
                      value={confirmCode}
                      onChange={(e) => setConfirmCode(e.target.value)}
                      data-testid="input-confirm-code"
                    />
                    <p className="text-xs text-muted-foreground">Ask the seller for the delivery code before confirming.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-pin">Transaction PIN</Label>
                    <Input
                      id="confirm-pin"
                      type="password"
                      maxLength={6}
                      placeholder="4–6 digit PIN"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      data-testid="input-confirm-pin"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={confirmMutation.isPending}
                    data-testid="button-confirm-submit"
                  >
                    {confirmMutation.isPending ? "Processing..." : "Release Payment"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canDispute && (
            <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1 h-11 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" data-testid="button-raise-dispute">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Raise Dispute
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Raise a Dispute</DialogTitle>
                  <DialogDescription>
                    Describe the issue clearly. Our arbitration team will review and contact both parties. Funds remain locked during the process.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Label htmlFor="dispute-reason">Reason for Dispute</Label>
                  <Textarea
                    id="dispute-reason"
                    className="mt-2 min-h-[120px]"
                    placeholder="Describe the problem in detail (minimum 20 characters)..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    data-testid="textarea-dispute-reason"
                  />
                  <p className="text-xs text-muted-foreground mt-2">{disputeReason.trim().length} / 20 minimum characters</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDisputeOpen(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={handleDispute}
                    disabled={disputeMutation.isPending}
                    data-testid="button-dispute-submit"
                  >
                    {disputeMutation.isPending ? "Submitting..." : "Submit Dispute"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
}
