import { useState } from "react";
import { useListReviews, useSubmitReview } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, CheckCircle2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} stars`}
          className="p-1"
        >
          <Star className={`h-7 w-7 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

export default function Reviews() {
  const { data: reviews, isLoading } = useListReviews();
  const submit = useSubmitReview();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    rating: 5,
    title: "",
    body: "",
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.body) {
      toast({ title: "Missing info", description: "Please fill in your name, email, and review.", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { ...form, title: form.title.trim() || null } as any },
      {
        onSuccess: (res: any) => {
          setSubmitted(true);
          toast({ title: "Thanks for the review!", description: res?.message || "It'll appear after a quick check." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to submit. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
      <SEO
        title="Reader Reviews"
        description="What readers think of Mapletechie. Share your own."
        url="/reviews"
      />

      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="font-bold uppercase tracking-widest text-sm text-primary mb-4">From our readers</p>
          <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[0.95] mb-8 tracking-tight">
            What readers say.
          </h1>
          <p className="text-xl text-muted-foreground font-serif leading-relaxed mb-12 border-l-4 border-primary pl-6 max-w-3xl">
            Honest feedback from the people who actually read us. Got something to say? Add yours
            below — we read everything.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-12">
          {/* Left: reviews list */}
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Recent reviews</h2>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-32 bg-card border border-border animate-pulse" />
                ))}
              </div>
            ) : !reviews?.length ? (
              <div className="border border-border bg-card p-10 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                <p className="font-bold mb-1">No reviews yet.</p>
                <p className="text-muted-foreground text-sm">Be the first to share what you think.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((r: any) => (
                  <div key={r.id} className="bg-card border border-border p-6">
                    <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                      <div>
                        {r.title && <h3 className="font-serif text-xl font-bold mb-1">{r.title}</h3>}
                        <p className="text-xs text-muted-foreground">
                          {r.name} · {format(new Date(r.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
                        ))}
                      </div>
                    </div>
                    <p className="text-foreground/80 font-serif leading-relaxed">{r.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: submission form */}
          <div>
            <div className="sticky top-24">
              <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Write a review</h2>
              {submitted ? (
                <div className="border border-primary bg-primary/5 p-10 text-center">
                  <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">Thanks!</h3>
                  <p className="text-muted-foreground text-sm">Your review will appear after a quick check.</p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="bg-card border border-border p-6 space-y-4">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Your rating</Label>
                    <div className="mt-2"><StarPicker value={form.rating} onChange={(n) => setForm({ ...form, rating: n })} /></div>
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">
                      Headline <span className="text-muted-foreground normal-case font-normal">(optional)</span>
                    </Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Sum it up in a line — or leave blank" className="rounded-none mt-2" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Your review *</Label>
                    <Textarea required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What do you think of Mapletechie? What works, what doesn't?" className="rounded-none mt-2" />
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wider">Name *</Label>
                      <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none mt-2" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wider">Email * <span className="text-muted-foreground normal-case font-normal">(not published)</span></Label>
                      <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-none mt-2" />
                    </div>
                  </div>
                  <Button type="submit" disabled={submit.isPending} className="w-full rounded-none font-black uppercase tracking-widest h-12">
                    {submit.isPending ? "Sending..." : "Submit review"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
