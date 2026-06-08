import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, Link } from "wouter";
import { useCreateBartarListing } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  commodity: z.string().min(2, "Commodity type is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unit: z.string().default("ton"),
  price: z.string().min(1, "Price is required"),
  qualityGrade: z.string().optional(),
  moistureLevel: z.string().optional(),
  originCountry: z.string().default("Nigeria"),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewBartarListing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateBartarListing();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      commodity: "",
      quantity: "",
      unit: "ton",
      price: "",
      qualityGrade: "",
      moistureLevel: "",
      originCountry: "Nigeria",
      description: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    try {
      await createMutation.mutateAsync({ data });
      toast({ title: "Listing Created", description: "Your commodity is now live on the Bartar exchange." });
      setLocation("/bartar");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/bartar">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold">Post Commodity</h1>
          <p className="text-muted-foreground text-sm">List wholesale commodities for institutional trading</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commodity Details</CardTitle>
          <CardDescription>Provide accurate specifications. These terms will be included in the escrow contract.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="commodity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commodity Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select commodity" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Sesame">Sesame Seeds</SelectItem>
                          <SelectItem value="Ginger">Ginger</SelectItem>
                          <SelectItem value="Cocoa">Cocoa Beans</SelectItem>
                          <SelectItem value="Cashew">Cashew Nuts</SelectItem>
                          <SelectItem value="Soya">Soya Beans</SelectItem>
                          <SelectItem value="Palm Oil">Palm Oil</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price per Ton (NGN)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="E.g. 1500000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity Available (Tons)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="qualityGrade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quality Grade</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g. Grade A, Standard" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="moistureLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moisture Level (%)</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g. 8%" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="originCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Origin</FormLabel>
                      <FormControl>
                        <Input placeholder="Nigeria" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Terms/Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Packaging details, shipping terms, etc." className="h-24" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90" disabled={isLoading}>
                {isLoading ? "Publishing..." : "Post Commodity Listing"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}