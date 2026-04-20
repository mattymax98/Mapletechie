import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ArrowLeft, PlusCircle, Pencil, Trash2, Save, X } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";

const CURRENCIES = [
  ["CAD", "Canadian Dollar"],
  ["USD", "US Dollar"],
  ["EUR", "Euro"],
  ["GBP", "British Pound"],
  ["AUD", "Australian Dollar"],
  ["JPY", "Japanese Yen"],
  ["CNY", "Chinese Yuan"],
  ["INR", "Indian Rupee"],
  ["NGN", "Nigerian Naira"],
  ["ZAR", "South African Rand"],
  ["BRL", "Brazilian Real"],
  ["MXN", "Mexican Peso"],
  ["CHF", "Swiss Franc"],
  ["SEK", "Swedish Krona"],
  ["NOK", "Norwegian Krone"],
  ["DKK", "Danish Krone"],
  ["NZD", "New Zealand Dollar"],
  ["SGD", "Singapore Dollar"],
  ["HKD", "Hong Kong Dollar"],
  ["KRW", "South Korean Won"],
] as const;

const TOKEN_KEY = "mapletechie_admin_token";

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  originalPrice?: number | null;
  currency?: string;
  affiliateUrl: string;
  imageUrl?: string | null;
  category: string;
  rating: number;
  reviewCount: number;
  badge?: string | null;
  isFeatured: boolean;
};

const empty = {
  name: "",
  description: "",
  price: "",
  originalPrice: "",
  currency: "CAD",
  affiliateUrl: "",
  imageUrl: "",
  category: "gear",
  rating: "4.5",
  reviewCount: "0",
  badge: "",
  isFeatured: false,
};

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const authHeaders = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function load() {
    const res = await fetch("/api/admin/products", { headers: authHeaders });
    if (res.ok) setProducts(await res.json());
  }

  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing("new");
    setForm(empty);
    setMsg(null);
  }

  function startEdit(p: Product) {
    setEditing(p.id);
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      originalPrice: p.originalPrice != null ? String(p.originalPrice) : "",
      currency: p.currency || "CAD",
      affiliateUrl: p.affiliateUrl,
      imageUrl: p.imageUrl || "",
      category: p.category,
      rating: String(p.rating),
      reviewCount: String(p.reviewCount),
      badge: p.badge || "",
      isFeatured: p.isFeatured,
    });
    setMsg(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const url = editing === "new" ? "/api/admin/products" : `/api/admin/products/${editing}`;
      const method = editing === "new" ? "POST" : "PUT";
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(form) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setMsg({ kind: "ok", text: editing === "new" ? "Product created." : "Product updated." });
      setEditing(null);
      await load();
    } catch (err: any) {
      setMsg({ kind: "err", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) { setMsg({ kind: "ok", text: "Product deleted." }); await load(); }
    else setMsg({ kind: "err", text: "Delete failed." });
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          {!editing && (
            <Button onClick={startNew} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <PlusCircle className="w-4 h-4" /> New Product
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Shop Products</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage affiliate products. Prices show in <span className="text-orange-400 font-medium">Canadian Dollars (CAD)</span> by default — choose another currency per product to override.
          </p>
        </div>

        {msg && (
          <div className={`mb-4 p-3 rounded text-sm ${msg.kind === "ok" ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
            {msg.text}
          </div>
        )}

        {editing !== null && (
          <form onSubmit={save} className="mb-8 p-6 bg-zinc-950 border border-zinc-800 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing === "new" ? "New Product" : `Edit Product #${editing}`}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} className="text-zinc-400">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-zinc-900 border-zinc-700" />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="bg-zinc-900 border-zinc-700" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Price *</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Original Price (optional)</Label>
                <Input type="number" step="0.01" min="0" value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} placeholder="For showing a discount" className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Currency</Label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full h-9 rounded-md bg-zinc-900 border border-zinc-700 px-3 text-sm">
                  {CURRENCIES.map(([code, name]) => (
                    <option key={code} value={code}>{code} — {name}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Default: CAD</p>
              </div>
            </div>

            <div>
              <Label>Affiliate URL *</Label>
              <Input type="url" value={form.affiliateUrl} onChange={(e) => setForm({ ...form, affiliateUrl: e.target.value })} required placeholder="https://..." className="bg-zinc-900 border-zinc-700" />
            </div>

            <div>
              <Label>Product Image</Label>
              <ImageUploadField value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Rating (0-5)</Label>
                <Input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Review Count</Label>
                <Input type="number" min="0" value={form.reviewCount} onChange={(e) => setForm({ ...form, reviewCount: e.target.value })} className="bg-zinc-900 border-zinc-700" />
              </div>
              <div>
                <Label>Badge (optional)</Label>
                <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="e.g. SALE, NEW" className="bg-zinc-900 border-zinc-700" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
              Featured (show on homepage)
            </label>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Product"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="text-zinc-400">Cancel</Button>
            </div>
          </form>
        )}

        {products === null ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full bg-zinc-900" />)}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p>No products yet.</p>
            <Button onClick={startNew} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white">Create your first product</Button>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-900 border-b border-zinc-800">
                <tr>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Product</th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Price</th>
                  <th className="text-left text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">Category</th>
                  <th className="text-right text-xs text-zinc-400 font-medium uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium line-clamp-1">{p.name}</span>
                        {p.isFeatured && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">Featured</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white">{formatPrice(p.price, p.currency)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400 capitalize hidden md:table-cell">{p.category}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(p)} className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-400">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(p.id, p.name)} className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
