import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Trash2, ArrowLeft, ShieldCheck, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "";

function useApi() {
  const getToken = () => {
    try {
      return sessionStorage.getItem("accessToken") || null;
    } catch {
      return null;
    }
  };

  const authFetch = useCallback(async (url: string, opts: RequestInit = {}) => {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> || {}),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${url}`, { ...opts, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }, []);

  return { authFetch };
}

interface CartItem {
  id: string;
  listingId: string;
  quantity: number;
  createdAt: string;
  listing?: {
    id: string;
    title: string;
    price: string;
    currency: string;
    unit: string;
    imageUrls?: string[];
    status: string;
  };
}

interface CheckoutResult {
  listingId: string;
  escrowId: string;
  status: string;
}

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { authFetch } = useApi();

  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutResults, setCheckoutResults] = useState<CheckoutResult[] | null>(null);
  const [checkoutErrors, setCheckoutErrors] = useState<string[]>([]);
  const [payingEscrowId, setPayingEscrowId] = useState<string | null>(null);

  const fetchCart = useCallback(async () => {
    try {
      const data = await authFetch("/api/v1/cart");
      setItems(data?.data || []);
    } catch (err: any) {
      toast({ title: "Failed to load cart", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [authFetch, toast]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const removeItem = async (id: string) => {
    try {
      await authFetch(`/api/v1/cart/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Item removed from cart" });
    } catch (err: any) {
      toast({ title: "Failed to remove item", description: err.message, variant: "destructive" });
    }
  };

  const updateQuantity = async (id: string, quantity: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      await authFetch("/api/v1/cart", {
        method: "POST",
        body: JSON.stringify({ listingId: item.listingId, quantity }),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i)),
      );
    } catch (err: any) {
      toast({ title: "Failed to update quantity", description: err.message, variant: "destructive" });
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    setCheckoutErrors([]);
    try {
      const result = await authFetch("/api/v1/cart/checkout", { method: "POST" });
      setCheckoutResults(result.results || []);
      if (result.errors?.length) {
        setCheckoutErrors(result.errors.map((e: any) => `${e.listingId}: ${e.error}`));
      }
      if (result.results?.length) {
        toast({
          title: "Checkout successful",
          description: `${result.results.length} escrow(s) created. Fund them to complete purchase.`,
        });
      }
      setItems([]);
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  const total = items.reduce((sum, item) => {
    const price = Number(item.listing?.price || 0);
    return sum + price * item.quantity;
  }, 0);
  const currency = items[0]?.listing?.currency || "NGN";

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (checkoutResults && checkoutResults.length > 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-6 w-6" />
              Checkout Complete
            </CardTitle>
            <CardDescription>
              Escrow transactions have been created. Fund each one to proceed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkoutResults.map((r) => {
              const isPaying = payingEscrowId === r.escrowId;
              return (
                <div key={r.escrowId} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Listing: {r.listingId.substring(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground">Escrow: {r.escrowId}</p>
                    <p className="text-xs text-muted-foreground mt-1">Status: {r.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={isPaying}
                      onClick={async () => {
                        setPayingEscrowId(r.escrowId);
                        try {
                          const token = sessionStorage.getItem("accessToken");
                          const res = await fetch("/api/v1/payments/initialize", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ escrowId: r.escrowId, provider: "PAYSTACK" }),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json.error);
                          if (json.redirectUrl) {
                            window.open(json.redirectUrl, "_blank");
                          }
                          toast({ title: "Payment initiated", description: `Reference: ${json.paymentReference}` });
                        } catch (err: any) {
                          toast({ title: "Payment failed", description: err.message, variant: "destructive" });
                        } finally {
                          setPayingEscrowId(null);
                        }
                      }}
                    >
                      {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                      Pay Now
                    </Button>
                    <Link href={`/seed/orders/${r.listingId}`}>
                      <Button size="sm" variant="outline">View Order</Button>
                    </Link>
                  </div>
                </div>
              );
            })}
            {checkoutErrors.length > 0 && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm font-semibold text-destructive mb-2">Errors:</p>
                {checkoutErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/80">{e}</p>
                ))}
              </div>
            )}
            <Button onClick={() => setLocation("/seed")} className="w-full">
              Continue Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold">Shopping Cart</h1>
            <p className="text-muted-foreground text-sm">{items.length} item(s) in your cart</p>
          </div>
        </div>
        <Link href="/seed">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Continue Shopping
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground text-sm mb-6">Browse the seed marketplace to add items.</p>
            <Link href="/seed">
              <Button>Browse Marketplace</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {items.map((item) => {
              const listing = item.listing;
              if (!listing) return null;
              const lineTotal = Number(listing.price) * item.quantity;
              return (
                <Card key={item.id}>
                  <CardContent className="flex items-start gap-4 p-4">
                    <div className="h-20 w-20 rounded-lg bg-muted overflow-hidden shrink-0">
                      {listing.imageUrls?.[0] ? (
                        <img src={listing.imageUrls[0]} alt={listing.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                          <ShoppingCart className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/seed/listings/${listing.id}`}>
                        <h3 className="font-semibold text-foreground hover:text-primary truncate">{listing.title}</h3>
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {listing.currency || "NGN"} {Number(listing.price).toLocaleString()} / {listing.unit}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Qty:</Label>
                          <Input
                            type="number"
                            min="1"
                            className="w-20 h-8 text-sm"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, Math.max(1, Number(e.target.value)))}
                          />
                        </div>
                        <span className="text-sm font-semibold text-foreground ml-auto">
                          {listing.currency || "NGN"} {lineTotal.toLocaleString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Separator />

          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Total ({items.length} items)</span>
                <span className="text-primary">{currency} {total.toLocaleString()}</span>
              </div>
              <div className="flex items-start gap-3 bg-secondary/10 p-4 rounded-lg">
                <ShieldCheck className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
                <p className="text-xs text-secondary-foreground">
                  Checkout will create an escrow for each item. Payment is secured until you confirm delivery.
                </p>
              </div>
              <Button
                className="w-full h-12 text-base"
                onClick={handleCheckout}
                disabled={checkingOut}
              >
                {checkingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Checkout (${currency} ${total.toLocaleString()})`
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
