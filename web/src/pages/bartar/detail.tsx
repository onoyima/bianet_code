import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBartarListing, useInitBartarEscrow, getGetBartarListingQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldCheck, FileText, Scale, HandshakeIcon, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function BartarDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: listing, isLoading } = useGetBartarListing(id!, { query: { enabled: !!id, queryKey: getGetBartarListingQueryKey(id!) } });
  const escrowMutation = useInitBartarEscrow();
  
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [pin, setPin] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Negotiation state
  const [negotiations, setNegotiations] = useState<any[]>([]);
  const [loadingNegotiations, setLoadingNegotiations] = useState(false);
  const [negotiateOpen, setNegotiateOpen] = useState(false);
  const [offeredPrice, setOfferedPrice] = useState("");
  const [offeredQty, setOfferedQty] = useState("");
  const [negMsg, setNegMsg] = useState("");
  const [submittingNeg, setSubmittingNeg] = useState(false);

  const token = (() => { try { return sessionStorage.getItem("accessToken"); } catch { return null; } })();
  const authHeaders = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

  useEffect(() => {
    if (!id || !token) return;
    setLoadingNegotiations(true);
    fetch(`/api/v1/bartar/negotiations`, { headers: authHeaders })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((d) => setNegotiations((d.data || []).filter((n: any) => n.listingId === id)))
      .catch(() => {})
      .finally(() => setLoadingNegotiations(false));
  }, [id]);

  const handleNegotiate = async () => {
    if (!offeredPrice || !offeredQty) return;
    setSubmittingNeg(true);
    try {
      const res = await fetch(`/api/v1/bartar/listings/${id}/negotiate`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ offeredPrice: Number(offeredPrice), offeredQuantity: Number(offeredQty), message: negMsg || undefined }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const result = await res.json();
      setNegotiations((prev) => [result, ...prev.filter((n) => n.id !== result.id)]);
      setNegotiateOpen(false);
      toast({ title: "Offer sent", description: "Your counter-offer has been submitted to the seller." });
    } catch (err: any) {
      toast({ title: "Failed to send offer", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingNeg(false);
    }
  };

  const handleNegotiationAction = async (negId: string, action: "accept" | "reject") => {
    try {
      const res = await fetch(`/api/v1/bartar/negotiations/${negId}/${action}`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const updated = await res.json();
      setNegotiations((prev) => prev.map((n) => (n.id === negId ? updated : n)));
      toast({ title: action === "accept" ? "Offer accepted" : "Offer rejected", description: action === "accept" ? "The counter-offer has been accepted." : "The counter-offer has been rejected." });
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-[200px] w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold">Commodity not found</h2>
        <Link href="/bartar" className="text-primary hover:underline mt-4 inline-block">Return to Exchange</Link>
      </div>
    );
  }

  const handleEscrow = async () => {
    if (!pin || pin.length < 4) {
      toast({ title: "PIN required", description: "Please enter your transaction PIN to initialize escrow", variant: "destructive" });
      return;
    }

    setIsOrdering(true);
    try {
      await escrowMutation.mutateAsync({
        data: {
          listingId: listing.id,
          quantityTons: orderQuantity,
          pin
        } as any
      });
      
      toast({ title: "Escrow Initialized", description: "Trade contract generation started." });
      setIsDialogOpen(false);
      setLocation(`/dashboard`); 
    } catch (err: any) {
      toast({ title: "Failed to initialize escrow", description: err.message, variant: "destructive" });
    } finally {
      setIsOrdering(false);
    }
  };

  const totalPrice = Number(listing.price) * Number(orderQuantity);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/bartar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Exchange
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div>
            <h1 className="text-4xl font-display font-bold text-foreground uppercase tracking-tight">{listing.commodity}</h1>
            <div className="flex items-center gap-4 text-muted-foreground mt-2 text-sm">
              <span>{listing.originCountry || "Nigeria"}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Scale className="h-4 w-4"/> {listing.quantity} {listing.unit} Available</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Quality Grade</dt>
                  <dd className="font-medium mt-1">{listing.qualityGrade || "Standard"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Moisture Level</dt>
                  <dd className="font-medium mt-1">{listing.moistureLevel || "N/A"}</dd>
                </div>
                <div className="sm:col-span-2 pt-4 border-t border-border">
                  <dt className="text-muted-foreground mb-2">Additional Terms</dt>
                  <dd className="font-medium whitespace-pre-wrap">{listing.description || "None provided."}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Negotiations Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HandshakeIcon className="h-5 w-5 text-secondary" />
                  Negotiations & Offers
                </CardTitle>
                <CardDescription>Counter-offers between buyer and seller</CardDescription>
              </div>
              {token && (
                <Dialog open={negotiateOpen} onOpenChange={setNegotiateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="whitespace-nowrap">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Make Offer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Counter-Offer</DialogTitle>
                      <DialogDescription>
                        Propose your own price and quantity for this listing.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Offered Price (per {listing.unit})</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={listing.price}
                          value={offeredPrice}
                          onChange={(e) => setOfferedPrice(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Offered Quantity ({listing.unit})</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={listing.quantity}
                          value={offeredQty}
                          onChange={(e) => setOfferedQty(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Message (optional)</Label>
                        <Textarea
                          className="min-h-[80px]"
                          placeholder="Add a note to your offer..."
                          value={negMsg}
                          onChange={(e) => setNegMsg(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNegotiateOpen(false)}>Cancel</Button>
                      <Button onClick={handleNegotiate} disabled={submittingNeg || !offeredPrice || !offeredQty}>
                        {submittingNeg ? "Sending..." : "Submit Offer"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {loadingNegotiations ? (
                <div className="text-center py-6 text-sm text-muted-foreground">Loading offers...</div>
              ) : negotiations.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">No offers yet. Click "Make Offer" to negotiate.</div>
              ) : (
                <div className="space-y-3">
                  {negotiations.map((neg: any) => (
                    <div key={neg.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {neg.currency || "NGN"} {Number(neg.offeredPrice).toLocaleString()} / {listing.unit}
                          </span>
                          <span className="text-xs text-muted-foreground">x {neg.offeredQuantity}</span>
                          <Badge variant={neg.status === "PENDING" ? "outline" : neg.status === "ACCEPTED" ? "default" : "destructive"} className="text-xs">
                            {neg.status}
                          </Badge>
                        </div>
                        {neg.message && <p className="text-xs text-muted-foreground mt-1 truncate">{neg.message}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Initiated: {new Date(neg.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {neg.status === "PENDING" && neg.targetId && token && (
                        <div className="flex gap-1 shrink-0 ml-2">
                          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleNegotiationAction(neg.id, "accept")}>
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleNegotiationAction(neg.id, "reject")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6 border-secondary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">
                {listing.currency || "NGN"} {Number(listing.price).toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground"> / {listing.unit}</span>
              </CardTitle>
              <CardDescription>
                Seller ID: {listing.sellerId.substring(0, 8)}...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-3">
                <Label>Quantity ({listing.unit})</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max={listing.quantity} 
                  value={orderQuantity} 
                  onChange={(e) => setOrderQuantity(e.target.value)} 
                />
                <div className="text-sm text-muted-foreground flex justify-between">
                  <span>Gross Contract Value:</span>
                  <span className="font-semibold text-foreground">{listing.currency || "NGN"} {totalPrice.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary/10 p-4 rounded-lg">
                <FileText className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
                <p className="text-xs text-secondary-foreground">
                  Initializing trade will generate a binding digital contract. Escrow deposit required upon signing.
                </p>
              </div>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full text-base h-12 bg-secondary text-secondary-foreground hover:bg-secondary/90" disabled={Number(orderQuantity) <= 0 || Number(orderQuantity) > Number(listing.quantity)}>
                    Initialize Escrow Trade
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm Trade Terms</DialogTitle>
                    <DialogDescription>
                      Initialize escrow for {orderQuantity} {listing.unit} of {listing.commodity}. 
                      A contract will be drafted.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Transaction PIN</Label>
                      <Input 
                        type="password" 
                        maxLength={6} 
                        placeholder="Enter your 4-6 digit PIN" 
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Required to authorize contract drafting.</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleEscrow} disabled={isOrdering} className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                      {isOrdering ? "Processing..." : "Generate Contract"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}