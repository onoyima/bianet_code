import { useState, useRef } from "react";
import { useAiDiagnose, useGetDiagnosticHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, CheckCircle2, History, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export default function AiDiagnose() {
  const { toast } = useToast();
  const diagnoseMutation = useAiDiagnose();
  const { data: history, isLoading: historyLoading, refetch } = useGetDiagnosticHistory();
  
  const [cropType, setCropType] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDiagnose = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({ title: "Image Required", description: "Please upload an image of the affected crop", variant: "destructive" });
      return;
    }

    setIsDiagnosing(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      if (cropType) formData.append("cropType", cropType);
      if (symptoms) formData.append("symptoms", symptoms);

      const res = await diagnoseMutation.mutateAsync({ data: formData as any });
      setResult(res);
      toast({ title: "Diagnosis Complete", description: "Your crop has been analyzed." });
      refetch();
    } catch (err: any) {
      toast({ title: "Analysis Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">AI Crop Diagnostics</h1>
        <p className="text-muted-foreground mt-1">Upload photos of affected plants for instant disease identification and treatment recommendations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>New Diagnosis</CardTitle>
              <CardDescription>Provide details about the affected crop</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Upload Image</Label>
                <div 
                  className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="font-medium text-sm">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">SVG, PNG, JPG or GIF (max. 5MB)</p>
                  <Input type="file" className="hidden" ref={fileInputRef} accept="image/*" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Crop Type (Optional)</Label>
                <Input placeholder="E.g. Tomato, Maize, Cassava" value={cropType} onChange={e => setCropType(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Observed Symptoms (Optional)</Label>
                <Textarea 
                  placeholder="Describe what you see (e.g. yellow spots on leaves, wilting)" 
                  value={symptoms} 
                  onChange={e => setSymptoms(e.target.value)}
                  className="h-24"
                />
              </div>

              <Button className="w-full" onClick={handleDiagnose} disabled={isDiagnosing}>
                {isDiagnosing ? "Analyzing Image..." : "Diagnose Crop"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {result ? (
            <Card className="border-primary/20">
              <CardHeader className="bg-primary/5 pb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-primary">Analysis Result</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h3 className="text-sm text-muted-foreground font-medium">Disease Identified</h3>
                  <p className="text-xl font-bold mt-1">{result.diseaseName || "Healthy Crop"}</p>
                </div>
                <div>
                  <h3 className="text-sm text-muted-foreground font-medium">Confidence Score</h3>
                  <p className="font-medium mt-1">{(result.confidence * 100).toFixed(1)}%</p>
                </div>
                <div className="pt-4 border-t border-border">
                  <h3 className="text-sm text-muted-foreground font-medium mb-2">Recommended Treatment</h3>
                  {result.treatmentOrganic && (
                    <div className="mb-3">
                      <p className="text-sm font-medium">Organic Approach</p>
                      <p className="text-sm text-muted-foreground mt-1">{result.treatmentOrganic}</p>
                    </div>
                  )}
                  {result.treatmentChemical && (
                    <div>
                      <p className="text-sm font-medium">Chemical Intervention</p>
                      <p className="text-sm text-muted-foreground mt-1">{result.treatmentChemical}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center border-dashed bg-muted/20 min-h-[300px]">
              <CardContent className="text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p>Run a diagnosis to see results here</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-4 w-4" />
                Recent History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : history?.data && history.data.length > 0 ? (
                <div className="space-y-3">
                  {history.data.slice(0, 5).map(item => (
                    <div key={item.id} className="flex justify-between items-center p-3 rounded-md bg-muted/30 text-sm">
                      <div>
                        <p className="font-medium">{item.diseaseName || "Analysis"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2 py-1 bg-background rounded text-xs">
                          {item.cropType || "Unknown"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No previous diagnoses found.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}