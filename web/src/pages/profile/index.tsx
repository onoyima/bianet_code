import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { User, Mail, Phone, MapPin, Building, ShieldCheck, Settings, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { data: user, isLoading } = useGetMe();
  const { toast } = useToast();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const token = sessionStorage.getItem("accessToken");
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast({ title: "Success", description: json.message });
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account details and preferences.</p>
      </div>

      <Card className="border-t-4 border-t-primary overflow-hidden">
        <div className="h-32 bg-muted/50 w-full"></div>
        <CardContent className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 -mt-16 sm:-mt-12 mb-6">
            <Avatar className="h-32 w-32 border-4 border-background shadow-sm">
              <AvatarImage src={user.avatarUrl || ""} alt={user.firstName || "User"} />
              <AvatarFallback className="text-4xl bg-primary/10 text-primary">
                {(user.firstName?.[0] || "") + (user.lastName?.[0] || "")}
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left flex-1 pb-2">
              <h2 className="text-2xl font-bold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2 mt-1">
                {user.role} 
                {user.kycStatus === "APPROVED" && (
                  <Badge variant="secondary" className="text-xs py-0 h-5">Verified</Badge>
                )}
              </p>
            </div>
            <div className="pb-2">
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                Edit Profile
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-border">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                Personal Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-md bg-muted/30">
                  <span className="text-sm text-muted-foreground">Full Name</span>
                  <span className="font-medium">{user.firstName} {user.lastName}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-md bg-muted/30">
                  <span className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="h-4 w-4"/> Phone</span>
                  <span className="font-medium">{user.phone}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-md bg-muted/30">
                  <span className="text-sm text-muted-foreground flex items-center gap-2"><Mail className="h-4 w-4"/> Email</span>
                  <span className="font-medium">{user.email || "Not provided"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Building className="h-5 w-5 text-muted-foreground" />
                Business Details
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-md bg-muted/30">
                  <span className="text-sm text-muted-foreground">Business Name</span>
                  <span className="font-medium">{user.businessName || "Not provided"}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-md bg-muted/30">
                  <span className="text-sm text-muted-foreground flex items-center gap-2"><MapPin className="h-4 w-4"/> Location</span>
                  <span className="font-medium">{user.state ? `${user.state}, ${user.country}` : "Not provided"}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-md bg-muted/30">
                  <span className="text-sm text-muted-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4"/> KYC Status</span>
                  <Badge variant={user.kycStatus === "APPROVED" ? "default" : "secondary"} className={user.kycStatus === "APPROVED" ? "bg-primary text-primary-foreground" : ""}>
                    {user.kycStatus}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Security Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Transaction PIN</p>
                <p className="text-sm text-muted-foreground">Required for escrow and payments</p>
              </div>
              <Button variant="outline">Update PIN</Button>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">Change your account password</p>
              </div>
              <Button variant="outline" onClick={() => setShowChangePassword(true)}>
                <Lock className="h-4 w-4 mr-2" />
                Change
              </Button>
            </div>

            <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                  <DialogDescription>Enter your current password and a new password.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Min 8 chars, uppercase, lowercase, digit, special char</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowChangePassword(false)}>Cancel</Button>
                  <Button onClick={handleChangePassword} disabled={changingPassword}>
                    {changingPassword ? "Changing..." : "Change Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Platform Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Language</p>
                <p className="text-sm text-muted-foreground">Current: {user.language === 'en' ? 'English' : user.language}</p>
              </div>
              <Button variant="outline">Change</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}