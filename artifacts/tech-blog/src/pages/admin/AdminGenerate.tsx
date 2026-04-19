import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Sparkles, AlertCircle, Loader2 } from "lucide-react";

const SAMPLE_TOPICS = [
  "Apple's rumored AR glasses launch in 2026",
  "Best budget electric vehicles under $35,000",
  "How to protect yourself from AI-generated phishing scams",
  "The new wave of open-source large language models",
  "Why mechanical keyboards are making a comeback",
  "NASA's plans for a permanent lunar base",
];

export default function AdminGenerate() {
  const { token } = useAdmin();
  const [, navigate] = useLocation();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (topic.trim().length < 3) {
      setError("Please enter a topic (at least a few words).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/generate-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const draft = await res.json();
      sessionStorage.setItem("ai-draft", JSON.stringify(draft));
      navigate("/admin/posts/new");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate post";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-500" />
            AI Post Generator
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-black uppercase tracking-tight mb-3">
            Draft a post in seconds
          </h2>
          <p className="text-zinc-400">
            Type a topic, hit Generate, and the AI will write a full article for you. You'll
            land on the editor where you can review, tweak, and publish — nothing goes live
            until you hit Publish.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-zinc-300">Topic</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Tesla's new robotaxi service launches in Austin"
              disabled={loading}
              className="bg-zinc-900 border-zinc-700 text-white text-lg h-14 focus:border-orange-500"
            />
            <p className="text-xs text-zinc-500">
              Be specific. "iPhone 18 leaked specs" works better than "Apple news".
            </p>
          </div>

          <Button
            type="submit"
            disabled={loading || topic.trim().length < 3}
            size="lg"
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2 w-full h-14 text-base font-bold uppercase tracking-wider"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Writing your post... (15-45 seconds)
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Post
              </>
            )}
          </Button>
        </form>

        <div className="mt-12 pt-8 border-t border-zinc-800">
          <p className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-bold">
            Need inspiration? Try one of these:
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                disabled={loading}
                className="text-sm px-3 py-2 rounded border border-zinc-800 text-zinc-300 hover:border-orange-500 hover:text-white transition-colors disabled:opacity-40"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 p-4 rounded bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-400 leading-relaxed">
          <p className="font-bold text-zinc-300 mb-1">How it works</p>
          <p>
            We send your topic to Claude (Anthropic's AI). It writes a full draft with
            title, intro, sections, and conclusion (~800–1400 words), picks a category, and
            assigns one of your cover images. You review and publish manually.
          </p>
        </div>
      </main>
    </div>
  );
}
