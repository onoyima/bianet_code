import { useAdminListKyc, useAdminUpdateKycStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Shield, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getAdminListKycQueryKey } from "@workspace/api-client-react";

export default function AdminKyc() {
  const { data, isLoading } = useAdminListKyc({ status: "UNDER_REVIEW" });
  const updateMutation = useAdminUpdateKycStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleUpdate = async (id: string, status: "APPROVED" | "REJECTED", notes?: string) => {
    try {
      await updateMutation.mutateAsync({ 
        id,
        data: { status, notes }
      });
      toast({ title: `KYC ${status}` });
      queryClient.invalidateQueries({ queryKey: getAdminListKycQueryKey({ status: "UNDER_REVIEW" }) });
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>KYC Verification Queue</CardTitle>
          <CardDescription>Review and approve business documents for Bartar exchange access.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : data?.data && data.data.length > 0 ? (
            <div className="space-y-4">
              {data.data.map(doc => (
                <div key={doc.id} className="border border-border rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-secondary" />
                      <span className="font-medium text-foreground">User ID: {doc.userId.substring(0, 8)}...</span>
                    </div>
                    <p className="text-sm text-muted-foreground flex gap-4">
                      <span>CAC: {doc.cacNumber}</span>
                      <span>Submitted: {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </p>
                    <div className="flex gap-2">
                      {doc.businessDocUrl && <a href={doc.businessDocUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><FileText className="h-3 w-3"/> Business Doc</a>}
                      {doc.governmentIdUrl && <a href={doc.governmentIdUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><FileText className="h-3 w-3"/> Gov ID</a>}
                    </div>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" size="sm" className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleUpdate(doc.id, "REJECTED", "Document quality insufficient")}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90" onClick={() => handleUpdate(doc.id, "APPROVED")}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p>The verification queue is empty.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}