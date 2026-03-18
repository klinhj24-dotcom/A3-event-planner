import { ExternalLink } from "lucide-react";

interface PublicFooterProps {
  eventUrl?: string | null;
}

export function PublicFooter({ eventUrl }: PublicFooterProps) {
  return (
    <div className="mt-8 pb-8 flex flex-col items-center gap-2 text-xs text-muted-foreground/50">
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {eventUrl && (
          <>
            <a
              href={eventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View Event
            </a>
            <span>·</span>
          </>
        )}
        <a
          href="https://themusicspace.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          themusicspace.com
        </a>
      </div>
      <p>© The Music Space</p>
    </div>
  );
}
