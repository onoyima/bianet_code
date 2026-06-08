import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetSeedListing, usePlaceSeedOrder, getGetSeedListingQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Package, ShieldCheck, ArrowLeft, Store, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function SeedDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: listing, isLoading } = useGetSeedListing(id!, { query: { enabled: !!id, queryKey: getGetSeedListingQueryKey(id!) } });
  const orderMutation = usePlaceSeedOrder();
  
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [pin, setPin] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-[400px] w-full rounded-xl" />
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
        <h2 className="text-2xl font-bold">Listing not found</h2>
        <Link href="/seed" className="text-primary hover:underline mt-4 inline-block">Return to Marketplace</Link>
      </div>
    );
  }

  const handleOrder = async () => {
    if (!pin || pin.length < 4) {
      toast({ title: "PIN required", description: "Please enter your transaction PIN to confirm the order", variant: "destructive" });
      return;
    }

    setIsOrdering(true);
    try {
      // Assuming response has the order id
      const res = await orderMutation.mutateAsync({
        data: {
          listingId: listing.id,
          quantity: orderQuantity,
          insurance: false
        }
      } as any);
      
      toast({ title: "Order placed", description: "Your payment is secured in escrow. Confirm delivery once goods arrive." });
      setIsDialogOpen(false);
      if (res?.id) {
        setLocation(`/seed/orders/${res.id}`);
      } else {
        setLocation("/seed");
      }
    } catch (err: any) {
      toast({ title: "Order Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsOrdering(false);
    }
  };

  const handleAddToCart = async () => {
    setAddingToCart(true);
    try {
      const token = sessionStorage.getItem("accessToken");
      if (!token) {
        toast({ title: "Not logged in", description: "Please log in to add items to cart", variant: "destructive" });
        return;
      }
      const res = await fetch("/api/v1/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: listing.id, quantity: Number(orderQuantity) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to add to cart" }));
        throw new Error(err.error);
      }
      toast({ title: "Added to cart", description: `${orderQuantity} ${listing.unit} added to your cart.` });
    } catch (err: any) {
      toast({ title: "Failed to add to cart", description: err.message, variant: "destructive" });
    } finally {
      setAddingToCart(false);
    }
  };

  const totalPrice = Number(listing.price) * Number(orderQuantity);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/seed" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to listings
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="aspect-video bg-muted rounded-xl overflow-hidden relative">
            {listing.imageUrls?.[0] ? (
              <img src={listing.imageUrls[0]} alt={listing.title} className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-secondary/10">
                <Store className="h-20 w-20 text-secondary/30" />
              </div>
            )}
            <div className="absolute top-4 left-4 bg-background/90 backdrop-blur px-3 py-1.5 rounded-md text-sm font-semibold">
              {listing.category}
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{listing.title}</h1>
            <div className="flex items-center gap-4 text-muted-foreground mt-2 text-sm">
              <div className="flex items-center gap-1"><MapPin className="h-4 w-4"/> {listing.state || "Nigeria"}</div>
              <div className="flex items-center gap-1"><Package className="h-4 w-4"/> {listing.quantity} {listing.unit} total</div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">{listing.description || "No description provided."}</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6 border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-primary">
                {listing.currency || "NGN"} {Number(listing.price).toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground"> / {listing.unit}</span>
              </CardTitle>
              <CardDescription>
                Sold by Seller ID: {listing.sellerId.substring(0, 8)}...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-3">
                <Label>Quantity to order ({listing.unit})</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max={listing.quantity} 
                  value={orderQuantity} 
                  onChange={(e) => setOrderQuantity(e.target.value)} 
                />
                <div className="text-sm text-muted-foreground flex justify-between">
                  <span>Total price:</span>
                  <span className="font-semibold text-foreground">{listing.currency || "NGN"} {totalPrice.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary/10 p-4 rounded-lg">
                <ShieldCheck className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
                <p className="text-xs text-secondary-foreground">
                  Your payment is secured by Bia'net Escrow. The seller only gets paid when you confirm delivery.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleAddToCart}
                  disabled={addingToCart || Number(orderQuantity) <= 0 || Number(orderQuantity) > Number(listing.quantity)}
                >
                  {addingToCart ? (
                    "Adding..."
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Add to Cart
                    </>
                  )}
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="flex-1 text-base h-12" disabled={Number(orderQuantity) <= 0 || Number(orderQuantity) > Number(listing.quantity)}>
                    Secure Order
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm Order</DialogTitle>
                    <DialogDescription>
                      You are about to place an order for {orderQuantity} {listing.unit} of {listing.title} for a total of {listing.currency || "NGN"} {totalPrice.toLocaleString()}.
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
                      <p className="text-xs text-muted-foreground">Required to authorize the escrow deposit.</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleOrder} disabled={isOrdering}>
                      {isOrdering ? "Processing..." : "Confirm & Pay"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}