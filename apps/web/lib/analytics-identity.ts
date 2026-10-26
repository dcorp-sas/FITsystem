const VISITOR_KEY = 'fitsystem.analytics.visitor.v1';

/** First-party random ID; it contains no name, email, or account information. */
export function getAnalyticsVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : 'anonymous';
  }
}
