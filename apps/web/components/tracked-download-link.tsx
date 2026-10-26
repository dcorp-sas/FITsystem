'use client';

import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { getAnalyticsVisitorId } from '@/lib/analytics-identity';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function TrackedDownloadLink({ href, onClick, ...props }: Props) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      const destination = new URL(href, window.location.href);
      if (destination.pathname.endsWith('/metrics/download/go')) {
        destination.searchParams.set('visitorId', getAnalyticsVisitorId());
        event.preventDefault();
        window.location.assign(destination.toString());
      }
    } catch {
      // Preserve the original anchor if the analytics URL is malformed.
    }
  }

  return <a href={href} onClick={handleClick} {...props} />;
}
