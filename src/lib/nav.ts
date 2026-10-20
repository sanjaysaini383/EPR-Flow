/** Sidebar navigation. `phase` marks sections that are placeholders until that build phase ships. */
export type NavItem = { label: string; path: string; icon: NavIcon; phase?: number };
export type NavGroup = { label: string; items: NavItem[] };

export type NavIcon =
  | "dashboard"
  | "alerts"
  | "materials"
  | "brands"
  | "plants"
  | "gst"
  | "targets"
  | "certificates"
  | "recyclers"
  | "extraction"
  | "reports"
  | "calendar"
  | "audit"
  | "settings"
  | "members";

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", path: "dashboard", icon: "dashboard" },
      { label: "Alerts", path: "alerts", icon: "alerts", phase: 3 },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Materials", path: "materials", icon: "materials" },
      { label: "Brands", path: "brands", icon: "brands" },
      { label: "Plants", path: "plants", icon: "plants" },
      { label: "GST registrations", path: "gst", icon: "gst" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { label: "Targets", path: "targets", icon: "targets", phase: 3 },
      { label: "Certificates", path: "certificates", icon: "certificates", phase: 4 },
      { label: "Recyclers", path: "recyclers", icon: "recyclers", phase: 4 },
      { label: "AI extraction", path: "extractions", icon: "extraction", phase: 5 },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Reports", path: "reports", icon: "reports", phase: 6 },
      { label: "Calendar", path: "calendar", icon: "calendar", phase: 6 },
      { label: "Audit log", path: "audit-log", icon: "audit" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Organization", path: "settings", icon: "settings" },
      { label: "Members", path: "settings/members", icon: "members" },
    ],
  },
];
