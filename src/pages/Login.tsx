import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    setIsLoading(false);

    if (error) {
      toast({
        title: "Login Failed",
        description: getUserFriendlyErrorMessage(error, "Email or password is incorrect. Please try again."),
        variant: "destructive",
      });
      return;
    }

    if (data.session) {
      localStorage.setItem("mock_auth", "true");
      navigate("/");
    }
  };

  const sendReset = async (event: FormEvent) => {
    event.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({
        title: "Reset Failed",
        description: getUserFriendlyErrorMessage(error, "We could not send a reset email. Please try again."),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Check your email",
      description: "If an account exists, a password reset email has been sent.",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mb-4 flex justify-center">
            <img
              src="https://vibe.filesafe.space/1780031277244837711/attachments/eeaeae6f-54af-49f5-b3f7-e9bf6ddae87a.png"
              alt="Lawbric Logo"
              className="h-16"
            />
          </div>
          <CardTitle className="text-xl font-bold">
            {showReset ? "Reset Password" : "Client Portal"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showReset ? (
            <form onSubmit={sendReset} className="space-y-4">
              <div className="space-y-2 text-left">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="Enter your email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg">
                Send Reset Email
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowReset(false)}>
                Back to Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2 text-left">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 text-left">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowReset(true)}>
                Forgot password?
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
