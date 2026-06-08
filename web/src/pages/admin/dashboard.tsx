import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileCheck,
  CircleDollarSign,
  Scale,
  Sprout,
  ArrowLeftRight,
  BookOpen,
} from "lucide-react";

interface AdminStats {
  totalUsers: number;
  pendingKyc: number;
  activeEscrows: number;
  disputedEscrows: number;
  seedListings: number;
  bartarListings: number;
  educationalContent: number;
}

const statCards = [
  { key: "totalUsers", label: "Total Users", icon: Users, color: "text-blue-600", bg: "bg-blue-100" },
  { key: "pendingKyc", label: "Pending KYC", icon: FileCheck, color: "text-amber-600", bg: "bg-amber-100" },
  { key: "activeEscrows", label: "Active Escrows", icon: CircleDollarSign, color: "text-green-600", bg: "bg-green-100" },
  { key: "disputedEscrows", label: "Disputed Escrows", icon: Scale, color: "text-red-600", bg: "bg-red-100" },
  { key: "seedListings", label: "Seed Listings", icon: Sprout, color: "text-emerald-600", bg: "bg-emerald-100" },
  { key: "bartarListings", label: "Bartar Listings", icon: ArrowLeftRight, color: "text-purple-600", bg: "bg-purple-100" },
  { key: "educationalContent", label: "Educational Content", icon: BookOpen, color: "text-indigo-600", bg: "bg-indigo-100" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    fetch("/api/v1/admin/stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(7)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-16" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-16 text-muted-foreground">Failed to load stats.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-display font-bold">Platform Overview</h2>
        <p className="text-muted-foreground mt-1">Key metrics at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {statCards.map(({ key, label, icon: Icon, color, bg }) => {
          const value = stats[key as keyof AdminStats];
          return (
            <Card key={key} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <div className={`p-2 rounded-full ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {stats.pendingKyc > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-sm px-3 py-1.5">
                {stats.pendingKyc} pending KYC reviews
              </Badge>
            )}
            {stats.disputedEscrows > 0 && (
              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-sm px-3 py-1.5">
                {stats.disputedEscrows} disputed escrows
              </Badge>
            )}
            {stats.activeEscrows > 0 && (
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-sm px-3 py-1.5">
                {stats.activeEscrows} active escrows
              </Badge>
            )}
            {stats.seedListings > 0 && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-sm px-3 py-1.5">
                {stats.seedListings} seed listings
              </Badge>
            )}
            {stats.bartarListings > 0 && (
              <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 text-sm px-3 py-1.5">
                {stats.bartarListings} bartar listings
              </Badge>
            )}
            {stats.totalUsers > 0 && (
              <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-sm px-3 py-1.5">
                {stats.totalUsers} total users
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
