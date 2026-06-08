import { useState } from "react";
import { useListBartarListings } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Filter, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function BartarExchange() {
  const [search, setSearch] = useState("");
  
  const { data, isLoading } = useListBartarListings({
    commodity: search || undefined
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Bartar Exchange</h1>
          <p className="text-muted-foreground mt-1">Institutional commodity trading backed by bank-grade escrow.</p>
        </div>
        <Link href="/bartar/listings/new">
          <Button className="w-full md:w-auto bg-secondary text-secondary-foreground hover:bg-secondary/90">
            <Plus className="h-4 w-4 mr-2" />
            Post Commodity
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search commodities (e.g. Sesame, Ginger)..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-0">
              <div className="p-6 flex flex-col md:flex-row gap-6 items-center">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="flex-1 space-y-3 w-full">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-4 w-1/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
                <div className="w-full md:w-auto text-right">
                  <Skeleton className="h-8 w-24 ml-auto" />
                  <Skeleton className="h-4 w-16 ml-auto mt-2" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <div className="space-y-4">
          {data.data.map((listing) => (
            <Card key={listing.id} className="hover:border-secondary transition-colors overflow-hidden">
              <div className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className="w-full md:w-auto flex flex-col sm:flex-row gap-6 flex-1">
                  <div className="h-24 w-24 rounded-lg bg-muted flex-shrink-0 relative overflow-hidden">
                    {listing.imageUrls?.[0] ? (
                      <img src={listing.imageUrls[0]} alt={listing.commodity} className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-3xl font-display font-bold text-muted-foreground/30 uppercase">
                        {listing.commodity.substring(0,2)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-xl uppercase tracking-tight">{listing.commodity}</h3>
                      {listing.isVerifiedExporter && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <ShieldCheck className="h-5 w-5 text-secondary" />
                            </TooltipTrigger>
                            <TooltipContent>Verified Exporter</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{listing.originCountry || "Nigeria"}</span>
                      <span>•</span>
                      <span>Grade: {listing.qualityGrade || "Standard"}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="bg-secondary/10 text-secondary-foreground border-secondary/20 hover:bg-secondary/20">
                        {listing.quantity} {listing.unit} Available
                      </Badge>
                      {listing.moistureLevel && (
                        <Badge variant="outline">Moisture: {listing.moistureLevel}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="w-full md:w-auto flex flex-row md:flex-col justify-between items-center md:items-end border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
                  <div className="text-left md:text-right mb-0 md:mb-4">
                    <div className="text-sm text-muted-foreground">Asking Price</div>
                    <div className="text-2xl font-bold text-foreground">
                      {listing.currency || "NGN"} {Number(listing.price).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {listing.unit}</span>
                    </div>
                  </div>
                  <Link href={`/bartar/listings/${listing.id}`}>
                    <Button>Trade Now</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 px-4 border border-dashed rounded-lg bg-card text-card-foreground">
          <p className="text-xl font-medium">No commodities found</p>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">There are currently no active listings matching your criteria. Be the first to post.</p>
          <Link href="/bartar/listings/new">
            <Button className="mt-6 bg-secondary text-secondary-foreground hover:bg-secondary/90">Post Commodity</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
// Temporary mock components for tooltip since it's not exported from tooltip.tsx
function TooltipProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function Tooltip({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function TooltipTrigger({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function TooltipContent({ children }: { children: React.ReactNode }) { return <div className="hidden">{children}</div>; }