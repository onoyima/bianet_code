import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useSubmitKyc, useGetKycStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const schema = z.object({
  cacNumber: z.string().min(5, "CAC Number is required"),
  businessDocUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  taxClearanceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  exportLicenseUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  governmentIdUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export default function KycVerification() {
  const { toast } = useToast();
  const { data: kycStatus, isLoading: isStatusLoading, refetch } = useGetKycStatus();
  const submitKycMutation = useSubmitKyc();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      cacNumber: "",
      businessDocUrl: "",
      taxClearanceUrl: "",
      exportLicenseUrl: "",
      governmentIdUrl: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    try {
      await submitKycMutation.mutateAsync({ 
        data: {
          cacNumber: data.cacNumber,
          businessDocUrl: data.businessDocUrl || null,
          taxClearanceUrl: data.taxClearanceUrl || null,
          exportLicenseUrl: data.exportLicenseUrl || null,
          governmentIdUrl: data.governmentIdUrl || null,
        }
      });
      toast({ title: "KYC Submitted", description: "Your documents are now under review." });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (isStatusLoading) {
    return <div className="p-8 text-center text-muted-foreground">Checking KYC Status...</div>;
  }

  // Define valid states since backend returns a wrapper array or object. Assuming it returns { data: KycDocument[] } or just the document if it exists.
  // The API spec says it returns KycListResponse for useGetKycStatus ? Wait, spec says useGetKycStatus returns KycDocument[]. Let's assume array and get first.
  const activeDoc = Array.isArray(kycStatus) ? kycStatus[0] : (kycStatus as any)?.data?.[0] || kycStatus;
  
  if (activeDoc && activeDoc.status === "UNDER_REVIEW") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Alert className="bg-secondary/10 border-secondary">
          <Clock className="h-5 w-5 text-secondary" />
          <AlertTitle className="text-secondary font-bold text-lg">Under Review</AlertTitle>
          <AlertDescription className="text-foreground mt-2">
            Your KYC documents have been submitted and are currently being reviewed by our compliance team. This usually takes 24-48 hours. You will be notified once complete.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (activeDoc && activeDoc.status === "APPROVED") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Alert className="bg-primary/10 border-primary">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <AlertTitle className="text-primary font-bold text-lg">Verification Complete</AlertTitle>
          <AlertDescription className="text-foreground mt-2">
            Your account is fully verified. You have unrestricted access to the Bartar commodity exchange.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">KYC Verification</h1>
        <p className="text-muted-foreground mt-1">Required for institutional trading on the Bartar Exchange.</p>
      </div>

      {activeDoc && activeDoc.status === "REJECTED" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Verification Rejected</AlertTitle>
          <AlertDescription>
            {activeDoc.reviewerNotes || "Please check your documents and submit again."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
          <CardDescription>Enter your CAC registration number and document URLs (In a real app, these would be file uploads).</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="cacNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CAC Registration Number</FormLabel>
                    <FormControl>
                      <Input placeholder="RC123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="font-semibold text-sm">Document Links</h3>
                
                <FormField
                  control={form.control}
                  name="businessDocUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Registration Certificate URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="governmentIdUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Director's Government ID URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Submitting..." : "Submit for Verification"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}