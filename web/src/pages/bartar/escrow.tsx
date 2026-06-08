import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetEscrow,
  useConfirmBartarDelivery,
  useGenerateContract,
  useSignContract,
  getGetEscrowQueryKey,
} from "@workspace/api-client-react";
import type { TradeContract } from "@workspace/api-client-react";
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
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  PenLine,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:  { label: "Pending",          variant: "outline"     },
  funded:   { label: "Funded",           variant: "secondary"   },
  released: { label: "Completed",        variant: "default"     },
  refunded: { label: "Refunded",         variant: "outline"     },
  disputed: { label: "Under Dispute",    variant: "destructive" },
  resolved: { label: "Resolved",         variant: "default"     },
};

export default function BartarEscrowDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: escrow, isLoading } = useGetEscrow(id!, {
    query: { enabled: !!id, queryKey: getGetEscrowQueryKey(id!) },
  });

  const confirmMutation = useConfirmBartarDelivery();
  const generateContractMutation = useGenerateContract();
  const signContractMutation = useSignContract();

  const [contract, setContract] = useState<TradeContract | null>(null);
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [signPin, setSignPin] = useState("");
  const [contractTerms, setContractTerms] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const handleGenerateContract = async () => {
    if (contractTerms.trim().length < 50) {
      return;
    }
    try {
      const result = await generateContractMutation.mutateAsync({
        data: { escrowId: id!, terms: contractTerms.trim() },
      });
      setContract(result);
      toast({ title: "Contract generated", description: "Review the terms and sign to proceed." });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  };

  const handleSign = async () => {
    if (!contract) return;
    if (!signPin || signPin.length < 4) {
      toast({ title: "PIN required", description: "Enter your transaction PIN to sign.", variant: "destructive" });
      return;
    }
    try {
      const updated = await signContractMutation.mutateAsync({
        id: contract.id,
        data: { pin: signPin },
      });
      setContract(updated);
      setSignOpen(false);
      toast({ title: "Contract signed", description: "Your signature has been recorded on-chain." });
      queryClient.invalidateQueries({ queryKey: getGetEscrowQueryKey(id!) });
    } catch (err: any) {
      toast({ title: "Signing failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  };

  const handleConfirmDelivery = async () => {
    if (!confirmPin || confirmPin.length < 4) {
      toast({ title: "PIN required", description: "Enter your 4–6 digit transaction PIN.", variant: "destructive" });
      return;
    }
    if (!confirmCode) {
      toast({ title: "Verification code required", description: "Enter the shipment verification code.", variant: "destructive" });
      return;
    }
    try {
      await confirmMutation.mutateAsync({
        id: id!,
        data: { pin: confirmPin, verificationCode: confirmCode },
      });
      toast({ title: "Delivery confirmed", description: "Escrow funds have been released to the seller." });
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetEscrowQueryKey(id!) });
    } catch (err: any) {
      toast({ title: "Confirmation failed", description: err?.data?.error ?? err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h2 className="text-xl font-semibold">Escrow not found</h2>
        <p className="text-muted-foreground mt-2 text-sm">This trade may have been archived or you don't have access.</p>
        <Link href="/bartar" className="text-primary hover:underline mt-6 inline-block text-sm">Back to Exchange</Link>
      </div>
    );
  }

  const statusCfg = STATUS_BADGES[escrow.status] ?? { label: escrow.status, variant: "outline" as const };
  const canConfirm = escrow.status === "funded";
  const canGenerate = escrow.status === "funded" && !contract;
  const canSign = !!contract && (!contract.signedByBuyer || !contract.signedBySeller);
  const bothSigned = contract?.signedByBuyer && contract?.signedBySeller;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/bartar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-bartar">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Exchange
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-escrow-id">
            Trade #{escrow.id.substring(0, 8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Bartar commodity escrow</p>
        </div>
        <Badge variant={statusCfg.variant} className="text-sm px-3 py-1.5" data-testid="status-escrow">
          {statusCfg.label}
        </Badge>
      </div>

      {escrow.status === "disputed" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dispute in progress</AlertTitle>
          <AlertDescription>Arbitration is underway. All funds remain locked until resolution.</AlertDescription>
        </Alert>
      )}

      {escrow.status === "released" && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Trade complete</AlertTitle>
          <AlertDescription>Delivery was confirmed and funds were released to the seller.</AlertDescription>
        </Alert>
      )}

      <Card data-testid="card-escrow-financials">
        <CardHeader>
          <CardTitle>Financial Settlement</CardTitle>
          <CardDescription>All amounts are held in escrow until delivery is confirmed</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <div>
              <dt className="text-muted-foreground">Contract Value</dt>
              <dd className="font-bold text-2xl mt-1 text-foreground">
                {escrow.currency ?? "NGN"} {Number(escrow.amount).toLocaleString()}
              </dd>
            </div>
            {escrow.platformCommission && (
              <div>
                <dt className="text-muted-foreground">Platform Fee</dt>
                <dd className="font-medium mt-1">{escrow.currency ?? "NGN"} {Number(escrow.platformCommission).toLocaleString()}</dd>
              </div>
            )}
            {escrow.logisticsFee && (
              <div>
                <dt className="text-muted-foreground">Logistics</dt>
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
              <dt className="text-muted-foreground">Buyer ID</dt>
              <dd className="font-medium mt-1 font-mono text-xs">{escrow.buyerId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seller ID</dt>
              <dd className="font-medium mt-1 font-mono text-xs">{escrow.sellerId}</dd>
            </div>
            {escrow.depositedAt && (
              <div>
                <dt className="text-muted-foreground">Funded At</dt>
                <dd className="font-medium mt-1">{new Date(escrow.depositedAt).toLocaleString()}</dd>
              </div>
            )}
            {escrow.paymentReference && (
              <div>
                <dt className="text-muted-foreground">Payment Reference</dt>
                <dd className="font-mono text-xs mt-1 break-all">{escrow.paymentReference}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card data-testid="card-contract">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-secondary" />
            Trade Contract
          </CardTitle>
          <CardDescription>
            A binding digital contract must be generated and signed by both parties before delivery can be confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!contract ? (
            <div className="text-center py-8 space-y-4">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No contract has been generated yet.</p>
              {canGenerate && (
                <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                      data-testid="button-generate-contract"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Generate Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Generate Trade Contract</DialogTitle>
                      <DialogDescription>
                        Define the binding terms of this commodity trade. Both parties must sign before delivery can be confirmed.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-2">
                      <Label htmlFor="contract-terms">Contract Terms</Label>
                      <Textarea
                        id="contract-terms"
                        className="min-h-[140px]"
                        placeholder="Describe commodity grade, quantity, delivery conditions, inspection requirements, and any other binding terms... (min 50 characters)"
                        value={contractTerms}
                        onChange={(e) => setContractTerms(e.target.value)}
                        data-testid="textarea-contract-terms"
                      />
                      <p className="text-xs text-muted-foreground">{contractTerms.trim().length} / 50 minimum characters</p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
                      <Button
                        onClick={async () => { await handleGenerateContract(); setGenerateOpen(false); }}
                        disabled={generateContractMutation.isPending || contractTerms.trim().length < 50}
                        data-testid="button-generate-submit"
                      >
                        {generateContractMutation.isPending ? "Generating..." : "Generate Contract"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  {contract.signedByBuyer
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <Clock className="h-4 w-4 text-muted-foreground" />}
                  <span className={contract.signedByBuyer ? "text-foreground" : "text-muted-foreground"}>
                    Buyer {contract.signedByBuyer ? "signed" : "signature pending"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {contract.signedBySeller
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <Clock className="h-4 w-4 text-muted-foreground" />}
                  <span className={contract.signedBySeller ? "text-foreground" : "text-muted-foreground"}>
                    Seller {contract.signedBySeller ? "signed" : "signature pending"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate">SHA-256: {contract.contentHash}</span>
                {contract.contentUrl && (
                  <a href={contract.contentUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80" data-testid="link-contract-doc">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>

              {bothSigned && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Contract fully executed</AlertTitle>
                  <AlertDescription>Both parties have signed. You can now confirm delivery once goods are received.</AlertDescription>
                </Alert>
              )}

              {canSign && (
                <Dialog open={signOpen} onOpenChange={setSignOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full" data-testid="button-sign-contract">
                      <PenLine className="h-4 w-4 mr-2" />
                      Sign Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Sign Trade Contract</DialogTitle>
                      <DialogDescription>
                        By signing, you agree to the terms of this commodity trade. Your digital signature is legally binding and timestamped.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-3 space-y-2">
                      <Label htmlFor="sign-pin">Transaction PIN</Label>
                      <Input
                        id="sign-pin"
                        type="password"
                        maxLength={6}
                        placeholder="4–6 digit PIN"
                        value={signPin}
                        onChange={(e) => setSignPin(e.target.value)}
                        data-testid="input-sign-pin"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSignOpen(false)}>Cancel</Button>
                      <Button
                        onClick={handleSign}
                        disabled={signContractMutation.isPending}
                        data-testid="button-sign-submit"
                      >
                        {signContractMutation.isPending ? "Signing..." : "Sign Contract"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {canConfirm && (
        <div className="flex items-start gap-3 bg-secondary/10 border border-secondary/20 rounded-lg p-4">
          <ShieldCheck className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
          <p className="text-sm text-secondary-foreground">
            Only confirm delivery after physically inspecting the shipment. This releases escrow funds to the seller permanently.
          </p>
        </div>
      )}

      {canConfirm && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button className="w-full h-12 text-base" data-testid="button-confirm-delivery">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Shipment Received
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Receipt of Shipment</DialogTitle>
              <DialogDescription>
                This will release funds to the seller. Only confirm after full inspection of the received commodity.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="confirm-bartar-code">Shipment Verification Code</Label>
                <Input
                  id="confirm-bartar-code"
                  placeholder="Code provided by seller/logistics"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  data-testid="input-confirm-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-bartar-pin">Transaction PIN</Label>
                <Input
                  id="confirm-bartar-pin"
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
                onClick={handleConfirmDelivery}
                disabled={confirmMutation.isPending}
                data-testid="button-confirm-submit"
              >
                {confirmMutation.isPending ? "Processing..." : "Release Funds"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
