import { useState } from "react";
import { useLocation } from "wouter";
import { useAdminVerify } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, AlertCircle } from "lucide-react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAdmin();
  const [, navigate] = useLocation();

  const verifyMutation = useAdminVerify({
    mutation: {
      onSuccess: (data) => {
        if (data.success) {
          login(password);
          navigate("/admin");
        } else {
          setError("Incorrect password. Please try again.");
        }
      },
      onError: () => {
        setError("Incorrect password. Please try again.");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("Please enter a password.");
      return;
    }
    verifyMutation.mutate({ data: { password } });
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            <span className="text-orange-500">MAPLE</span>TECHIE Admin
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Enter your admin password to access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Admin Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-orange-500"
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? "Verifying..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
