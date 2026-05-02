import { useState } from "react";
import { Link } from "wouter";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, AlertCircle, CheckCircle2, Mail } from "lucide-react";

const TOKEN_KEY = "mapletechie_admin_token";
const MAPLETECHIE_EMAIL_RE = /@mapletechie\.com$/i;

const TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: "Intro / outreach",
    subject: "Quick hello from Mapletechies",
    body: "Hi [Name],\n\nI'm [Your name] at Mapletechies — we cover [topic] for [audience]. I came across [thing they did] and wanted to reach out about [reason].\n\nWould you have 20 minutes in the next two weeks for a quick call?\n\n",
  },
  {
    label: "Press / interview request",
    subject: "Mapletechies — interview request on [topic]",
    body: "Hi [Name],\n\nI'm working on a piece about [topic] for Mapletechies and would love to include your perspective. The angle is [angle], and I'd need about 30 minutes of your time, recorded for accuracy.\n\nIs there a window in the next week or two that works?\n\n",
  },
  {
    label: "Partnership / collab",
    subject: "Possible collab between Mapletechies and [Company]",
    body: "Hi [Name],\n\nLove what [Company] is doing with [thing]. We've been thinking about [collab idea] and I think there's a natural fit with our audience.\n\nHappy to share more details and a rough proposal — let me know if it's worth a 20-min chat.\n\n",
  },
  {
    label: "Start blank",
    subject: "",
    body: "",
  },
];

export default function AdminSendEmail() {
  const { user: me } = useAdmin();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const senderEmail = (me?.email || "").trim();
  const hasMapletechieEmail = MAPLETECHIE_EMAIL_RE.test(senderEmail);

  const applyTemplate = (t: typeof TEMPLATES[number]) => {
    setSubject(t.subject);
    setMessage(t.body);
    setFeedback(null);
  };

  const reset = () => {
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setMessage("");
    setShowCcBcc(false);
    setFeedback(null);
  };

  async function send() {
    setFeedback(null);
    if (!to.trim()) return setFeedback({ kind: "err", text: "Add at least one recipient in the To field." });
    if (!subject.trim()) return setFeedback({ kind: "err", text: "Subject is required." });
    if (!message.trim()) return setFeedback({ kind: "err", text: "Message is required." });
    if (!hasMapletechieEmail) {
      return setFeedback({
        kind: "err",
        text: "Your profile email isn't an @mapletechie.com address — ask the founding admin to set one before sending.",
      });
    }

    setSending(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Send failed");
      setFeedback({ kind: "ok", text: json.message || "Sent." });
      setTimeout(reset, 1500);
    } catch (err: any) {
      setFeedback({ kind: "err", text: err.message || "Send failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" />
            <h1 className="text-lg font-semibold">Send Email</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {!hasMapletechieEmail && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded-lg p-4">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">You can't send mail until your profile email is set.</p>
              <p className="mt-1 text-amber-200/80">
                Your "From" address needs to be an <code className="text-amber-100">@mapletechie.com</code> email
                (e.g. <code className="text-amber-100">{me?.username || "you"}@mapletechie.com</code>) so it sends through our verified domain. Ask the founding admin to set this in <Link href="/admin/users" className="underline hover:text-white">Manage Editors</Link>.
              </p>
            </div>
          </div>
        )}

        {hasMapletechieEmail && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300">
            <p>
              Sending as{" "}
              <span className="font-mono text-orange-400">
                {me?.displayName} &lt;{senderEmail}&gt;
              </span>
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Replies route back to your address. The Mapletechies header bar and a "Best, {me?.displayName}" sign-off are added automatically.
            </p>
          </div>
        )}

        <section className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Templates</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-800 hover:text-orange-400"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="to">To <span className="text-red-400">*</span></Label>
            <Input
              id="to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="someone@example.com, another@example.com"
              className="bg-zinc-900 border-zinc-700 mt-1"
            />
            <p className="text-xs text-zinc-500 mt-1">Comma-separate up to 25 recipients.</p>
          </div>

          {!showCcBcc ? (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-zinc-500 hover:text-orange-400 underline"
            >
              + Add CC / BCC
            </button>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="optional"
                  className="bg-zinc-900 border-zinc-700 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="bcc">BCC</Label>
                <Input
                  id="bcc"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="optional"
                  className="bg-zinc-900 border-zinc-700 mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="subject">Subject <span className="text-red-400">*</span></Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Short, specific, no clickbait"
              className="bg-zinc-900 border-zinc-700 mt-1"
            />
            <p className="text-xs text-zinc-500 mt-1">{subject.length} / 200</p>
          </div>

          <div>
            <Label htmlFor="message">Message <span className="text-red-400">*</span></Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={20000}
              rows={14}
              placeholder="Write your message…"
              className="bg-zinc-900 border-zinc-700 mt-1 font-mono text-sm"
            />
            <p className="text-xs text-zinc-500 mt-1">{message.length} / 20,000 characters · Plain text — line breaks are preserved.</p>
          </div>

          {feedback && (
            <div
              className={`flex items-start gap-2 text-sm p-3 rounded border ${
                feedback.kind === "ok"
                  ? "bg-green-500/10 text-green-300 border-green-500/30"
                  : "bg-red-500/10 text-red-300 border-red-500/30"
              }`}
            >
              {feedback.kind === "ok" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
            <Button
              type="button"
              onClick={send}
              disabled={sending || !hasMapletechieEmail}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? "Sending…" : "Send email"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} className="text-zinc-400">
              Clear
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
