import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useSearchParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const resetSchema = z.object({
  otp: z.string().min(6, "OTP must be 6 digits").max(6),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must include an uppercase letter")
    .regex(/[a-z]/, "Must include a lowercase letter")
    .regex(/[0-9]/, "Must include a digit")
    .regex(/[^A-Za-z0-9]/, "Must include a special character"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetFormValues = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const phone = searchParams.get("phone") || "";

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { otp: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (data: ResetFormValues) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: data.otp, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast({ title: "Password Reset", description: "You can now sign in with your new password." });
      setLocation("/login");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-2 text-center pb-8">
          <CardTitle className="text-3xl font-display font-bold text-primary">Reset Password</CardTitle>
          <CardDescription>Enter the code sent to {phone || "your phone"} and your new password</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="otp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reset Code</FormLabel>
                    <FormControl>
                      <Input placeholder="000000" maxLength={6} disabled={isLoading} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" disabled={isLoading} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" disabled={isLoading} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                {isLoading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-center border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="text-primary font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
