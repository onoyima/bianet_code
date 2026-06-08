import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useCreateSeedListing } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  category: z.string().min(2, "Category is required"),
  price: z.string().min(1, "Price is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unit: z.string().min(1, "Unit is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  state: z.string().min(2, "State is required"),
  latitude: z.number().default(9.05785),
  longitude: z.number().default(7.49508),
});

type FormValues = z.infer<typeof schema>;

export default function NewSeedListing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateSeedListing();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      category: "",
      price: "",
      quantity: "",
      unit: "kg",
      description: "",
      state: "",
      latitude: 9.05785,
      longitude: 7.49508,
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    try {
      await createMutation.mutateAsync({ data });
      toast({ title: "Listing Created", description: "Your produce is now live on the Seed marketplace." });
      setLocation("/seed");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/seed">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold">Post Produce</h1>
          <p className="text-muted-foreground text-sm">Create a new listing in the Seed marketplace</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listing Details</CardTitle>
          <CardDescription>Provide accurate information about your produce.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g. Fresh Tomatoes (Basket)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Vegetables">Vegetables</SelectItem>
                          <SelectItem value="Fruits">Fruits</SelectItem>
                          <SelectItem value="Grains">Grains</SelectItem>
                          <SelectItem value="Tubers">Tubers</SelectItem>
                          <SelectItem value="Livestock">Livestock</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location (State)</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g. Kano, Lagos, FCT" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (NGN)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="5000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="kg">Kilograms (kg)</SelectItem>
                          <SelectItem value="basket">Basket</SelectItem>
                          <SelectItem value="bag">Bag</SelectItem>
                          <SelectItem value="ton">Ton</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe the quality, harvest date, and any other relevant details..." className="h-32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Publishing..." : "Post Listing"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}