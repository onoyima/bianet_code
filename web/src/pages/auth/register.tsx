import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useSendOtp } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RegisterInputRole } from "@workspace/api-client-react";

const registerSchema = z.object({
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.nativeEnum(RegisterInputRole),
  otp: z.string().length(6, "OTP must be 6 digits").optional(),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const sendOtpMutation = useSendOtp();
  const [step, setStep] = useState<"details" | "otp">("details");
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      phone: "",
      firstName: "",
      lastName: "",
      password: "",
      role: "FARMER",
      otp: "",
    },
  });

  const onSendOtp = async () => {
    const isValid = await form.trigger(["phone", "firstName", "lastName", "password", "role"]);
    if (!isValid) return;

    setIsLoading(true);
    try {
      await sendOtpMutation.mutateAsync({
        data: { phone: form.getValues("phone"), purpose: "REGISTRATION" }
      });
      setStep("otp");
      toast({ title: "OTP Sent", description: "Please check your phone for the verification code." });
    } catch (err: any) {
      toast({ title: "Failed to send OTP", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: RegisterFormValues) => {
    if (step === "details") {
      await onSendOtp();
      return;
    }

    if (!data.otp) {
      form.setError("otp", { message: "OTP is required" });
      return;
    }

    setIsLoading(true);
    try {
      await register({
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
        role: data.role,
        otp: data.otp,
      });
    } catch (error) {
      // Error handled in auth context
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 py-12">
      <Card className="w-full max-w-lg shadow-lg border-primary/10">
        <CardHeader className="space-y-2 text-center pb-8">
          <CardTitle className="text-3xl font-display font-bold text-primary">Join Bia'net</CardTitle>
          <CardDescription>Create your enterprise account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className={step === "otp" ? "hidden" : "space-y-6"}>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+234..." {...field} />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="FARMER">Farmer</SelectItem>
                          <SelectItem value="TRADER">Commodity Trader</SelectItem>
                          <SelectItem value="EXPORTER">Exporter</SelectItem>
                          <SelectItem value="IMPORTER">Importer</SelectItem>
                          <SelectItem value="LOGISTICS_PROVIDER">Logistics Provider</SelectItem>
                          <SelectItem value="CONSUMER">Consumer / Buyer</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {step === "otp" && (
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="otp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Verification Code (OTP)</FormLabel>
                        <FormControl>
                          <Input placeholder="123456" maxLength={6} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="text-sm text-muted-foreground flex justify-between">
                    <span>Code sent to {form.getValues("phone")}</span>
                    <button type="button" onClick={() => setStep("details")} className="text-primary hover:underline">Change number</button>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                {isLoading ? "Please wait..." : step === "details" ? "Continue to Verification" : "Create Account"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-center border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Log in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}