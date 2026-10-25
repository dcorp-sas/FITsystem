'use client';

export type IconName =
  | 'dashboard'
  | 'members'
  | 'plans'
  | 'memberships'
  | 'payments'
  | 'cash'
  | 'shop'
  | 'products'
  | 'attendance'
  | 'classes'
  | 'instructors'
  | 'equipment'
  | 'notifications'
  | 'reports'
  | 'import'
  | 'settings'
  | 'users'
  | 'branches'
  | 'activity'
  | 'logout'
  | 'menu'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'check'
  | 'close'
  | 'search'
  | 'chevron'
  | 'mobile'
  | 'news'
  | 'license'
  | 'routines'
  | 'card'
  | 'copy'
  | 'mail'
  | 'whatsapp'
  | 'instagram';

const PATHS: Record<IconName, string> = {
  dashboard: 'M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6ZM13 9h8V3h-8v6Z',
  members: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  plans: 'M9 11H3v10h6V11Zm12 0h-6v10h6V11ZM9 3H3v6h6V3Zm12 0h-6v6h6V3Z',
  memberships: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9V2Zm-1 10 2 2 4-4',
  payments: 'M2 7h20v10H2V7Zm0 5h20M6 15h4',
  cash: 'M2 7h20v12H2V7Zm10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 7V5h12v2',
  shop: 'M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  products: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  attendance: 'M9 12l2 2 4-4M12 3l9 4v6c0 5-3.5 8.5-9 9-5.5-.5-9-4-9-9V7l9-4Z',
  classes: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm7 8v4l3 2',
  instructors: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 6v-1a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5v1M12 7V3l3 2-3 2Z',
  equipment: 'M14 6a4 4 0 1 0-4 4 4 4 0 0 0 4-4ZM7.5 12 2 22h20l-5.5-10M6 18h12',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  reports: 'M3 3v18h18M8 17V9m4 8V5m4 12v-6',
  import: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.1l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.9-1.1L14.6 3h-4l-.4 2.6a7.5 7.5 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.9 1.1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.6c.1-.4.1-.7.1-1.1Z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  branches: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 12h18M3 6h18M3 18h18',
  plus: 'M12 5v14M5 12h14',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  chevron: 'm6 9 6 6 6-6',
  mobile: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 17h.01',
  news: 'M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 1-2Zm2 4h7M6 12h9M6 16h5',
  license: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-2 9 2 2 4-4',
  routines: 'M6 4h12M6 12h12M6 20h12M2 4h.01M2 12h.01M2 20h.01',
  card: 'M2 5h20v14H2V5Zm0 5h20M6 15h4',
  copy: 'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2ZM5 15H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1',
  mail: 'M2 5h20v14H2V5Zm0 0 10 7 10-7',
  whatsapp: 'M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Zm4.3 12.4c-.2.5-1 1-1.4 1-.4.1-.9.1-1.4-.1-.5-.2-1.7-.7-2.9-1.8-1.1-1-1.8-2.2-2-2.7-.2-.5-.2-1-.1-1.4 0-.4.5-1.2 1-1.4.2-.1.4-.1.6 0l.7 1.3c.1.2 0 .4-.1.5l-.5.6c-.1.1-.2.3-.1.5.2.4.6.9 1 1.3.4.4.9.8 1.3 1 .2.1.4 0 .5-.1l.6-.5c.1-.1.3-.2.5-.1l1.3.7c.1.1.2.3.1.6Z',
  instagram: 'M7 2.8h10A4.2 4.2 0 0 1 21.2 7v10a4.2 4.2 0 0 1-4.2 4.2H7A4.2 4.2 0 0 1 2.8 17V7A4.2 4.2 0 0 1 7 2.8ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.2-1.3h.01',
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'dashboard' ? 1.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}