import { useState } from "react";
import {
  useListComments,
  useSubmitComment,
  getListCommentsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export function CommentsSection({ postSlug }: { postSlug: string }) {
  const { data: comments, refetch } = useListComments(
    { postSlug },
    {
      query: {
        enabled: !!postSlug,
        queryKey: getListCommentsQueryKey({ postSlug }),
      },
    },
  );
  const submit = useSubmitComment();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", body: "" });
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.body.trim()) {
      toast({ title: "Missing info", description: "Please fill name, email and your comment.", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { postSlug, ...form } as any },
      {
        onSuccess: (res: any) => {
          setDone(true);
          setForm({ name: "", email: "", body: "" });
          toast({ title: "Thanks!", description: res?.message || "Your comment will appear once approved." });
          refetch();
        },
        onError: () => {
          toast({ title: "Could not send", description: "Please try again in a moment.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <section className="container mx-auto px-4 md:px-6 max-w-3xl pb-20">
      <div className="border-t border-border pt-12">
        <h2 className="text-2xl font-black uppercase tracking-tight mb-8 flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-primary" />
          Comments {comments?.length ? `(${comments.length})` : ""}
        </h2>

        {/* Existing comments */}
        <div className="space-y-5 mb-12">
          {!comments?.length ? (
            <p className="text-muted-foreground text-sm">Be the first to share what you think.</p>
          ) : (
            comments.map((c: any) => (
              <div key={c.id} className="border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                  <span className="font-bold text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.createdAt), "MMM d, yyyy · h:mm a")}
                  </span>
                </div>
                <p className="text-foreground/90 font-serif leading-relaxed whitespace-pre-line text-sm">
                  {c.body}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Submission form */}
        {done ? (
          <div className="border border-primary bg-primary/5 p-6 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Thanks for joining the conversation.</p>
              <p className="text-sm text-muted-foreground">Your comment will appear once it's been approved.</p>
              <button
                type="button"
                onClick={() => setDone(false)}
                className="mt-3 text-xs uppercase font-bold tracking-widest text-primary hover:underline"
              >
                Leave another comment
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="border border-border bg-card p-6 space-y-4">
            <h3 className="font-black uppercase tracking-wide text-sm">Leave a comment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  className="rounded-none mt-2"
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider">
                  Email <span className="text-muted-foreground normal-case font-normal">(not published)</span>
                </Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  className="rounded-none mt-2"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider">Comment</Label>
              <Textarea
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Share your thoughts on this article..."
                className="rounded-none mt-2"
                maxLength={4000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comments are reviewed before they appear. Keep it respectful.
              </p>
            </div>
            <Button
              type="submit"
              disabled={submit.isPending}
              className="rounded-none font-black uppercase tracking-widest"
            >
              {submit.isPending ? "Sending..." : "Post comment"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
