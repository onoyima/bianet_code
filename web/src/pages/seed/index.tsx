import { useState } from "react";
import { useGetNearbySeedListings } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Search, Plus } from "lucide-react";
import { Link } from "wouter";

export default function SeedMarketplace() {
  const [search, setSearch] = useState("");
  // Default coordinates (e.g., Abuja) for demonstration
  const { data, isLoading } = useGetNearbySeedListings({
    lat: 9.05785,
    lng: 7.49508,
    category: search || undefined
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Seed Marketplace</h1>
          <p className="text-muted-foreground mt-1">Source fresh produce directly from local farmers.</p>
        </div>
        <Link href="/seed/listings/new">
          <Button className="w-full md:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Listing
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by category..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <Skeleton className="h-48 w-full rounded-t-lg rounded-b-none" />
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.data.map((listing) => (
            <Card key={listing.id} className="overflow-hidden flex flex-col hover:border-primary/50 transition-colors">
              <div className="h-48 bg-muted relative">
                {listing.imageUrls?.[0] ? (
                  <img src={listing.imageUrls[0]} alt={listing.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="absolute top-2 right-2 bg-background/90 backdrop-blur text-xs font-medium px-2 py-1 rounded">
                  {listing.category}
                </div>
              </div>
              <CardContent className="p-4 flex-1">
                <h3 className="font-semibold text-lg line-clamp-1">{listing.title}</h3>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">{listing.state || "Unknown location"} • {listing.distanceKm ? `${listing.distanceKm.toFixed(1)}km away` : ""}</span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Price</p>
                    <p className="font-semibold text-lg text-primary">{listing.currency || "NGN"} {listing.price} / {listing.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Available</p>
                    <p className="font-medium">{listing.quantity} {listing.unit}</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Link href={`/seed/listings/${listing.id}`} className="w-full">
                  <Button variant="outline" className="w-full">View Details</Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 px-4 border border-dashed rounded-lg bg-card text-card-foreground">
          <p className="text-lg font-medium">No listings found</p>
          <p className="text-muted-foreground mt-1">Try adjusting your search or check back later.</p>
        </div>
      )}
    </div>
  );
}