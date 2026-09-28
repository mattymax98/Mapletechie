import { useState } from "react";
import { useGetPostUpdateHistory, getGetPostUpdateHistoryQueryKey } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).format(date);
}

export function UpdateHistory({ slug, modifiedAt, label }: {
  slug: string; modifiedAt: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, refetch } = useGetPostUpdateHistory(slug, {
    query: { queryKey: getGetPostUpdateHistoryQueryKey(slug), enabled: open, staleTime: 60_000, retry: false },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" data-testid="text-update-datetime"
          className="text-left underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={`Last updated ${label}. Open update history`}>
          Last updated <time dateTime={modifiedAt}>{label}</time>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(80vh,700px)] overflow-y-auto rounded-none">
        <DialogHeader>
          <DialogTitle>Update history</DialogTitle>
          <DialogDescription>Substantive changes approved after this article was published.</DialogDescription>
        </DialogHeader>
        {isPending && <p role="status" className="text-sm text-muted-foreground">Loading update history…</p>}
        {isError && <div role="alert" className="text-sm">
          <p>Update history is temporarily unavailable. You can keep reading the article.</p>
          <button type="button" className="mt-2 underline" onClick={() => void refetch()}>Try again</button>
        </div>}
        {!isPending && !isError && (data?.items.length
          ? <ol className="space-y-5">
              {data.items.map((entry, index) => (
                <li key={`${entry.date}-${index}`} className="border-l-2 border-primary pl-4">
                  <time dateTime={entry.date} className="block text-sm font-semibold">{dateLabel(entry.date)}</time>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
                </li>
              ))}
            </ol>
          : <p className="text-sm text-muted-foreground">No public update details are available for this article.</p>)}
      </DialogContent>
    </Dialog>
  );
}