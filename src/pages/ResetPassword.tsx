import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Scale } from "lucide-react";

export function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        setSessionError(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionError(false);
      } else if (!session) {
        setSessionError(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();

    if (password.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Your password has been updated successfully.",
      });

      await supabase.auth.signOut();
      navigate("/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset password.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Invalid Link</CardTitle>
            <CardDescription className="text-sm">
              Your password reset link is invalid or has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Return to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-border/50 shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Scale className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Reset Password</CardTitle>
          <CardDescription className="text-sm">Enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                placeholder="Confirm your new password"
                className="bg-background"
              />
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
