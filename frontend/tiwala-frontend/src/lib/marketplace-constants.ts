export const MARKETPLACE_CATEGORIES = [
  { value: "development", label: "Development" },
  { value: "design", label: "Design" },
  { value: "marketing", label: "Marketing" },
  { value: "writing", label: "Writing" },
  { value: "admin_support", label: "Admin Support" },
  { value: "customer_support", label: "Customer Support" },
  { value: "video_media", label: "Video & Media" },
  { value: "blockchain", label: "Blockchain" },
  { value: "ai_data", label: "AI & Data" },
  { value: "product_strategy", label: "Product & Strategy" },
] as const;

export const MARKETPLACE_EXPERIENCE_LEVELS = [
  { value: "entry", label: "Entry" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" },
] as const;

export const MARKETPLACE_JOB_TYPES = [
  { value: "fixed_price", label: "Fixed-price" },
] as const;

export const MARKETPLACE_BUDGET_TYPES = [
  { value: "fixed", label: "Fixed amount" },
  { value: "range", label: "Budget range" },
] as const;

export const MARKETPLACE_VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
] as const;

export const MARKETPLACE_POSTED_WITHIN = [
  { value: "any", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
] as const;

export const MARKETPLACE_SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "budget_high", label: "Budget high-low" },
  { value: "budget_low", label: "Budget low-high" },
  { value: "closing_soon", label: "Closing soon" },
  { value: "fewest_proposals", label: "Fewest proposals" },
] as const;

export const MARKETPLACE_SUGGESTED_SKILLS = [
  "React",
  "Next.js",
  "Solidity",
  "Tailwind",
  "Figma",
  "UI Design",
  "Copywriting",
  "Customer Support",
  "Video Editing",
  "Prompt Engineering",
];

export const POSTING_STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  Published: "Open",
  Closed: "Closed",
  Filled: "Filled",
  Expired: "Expired",
};

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  Submitted: "Submitted",
  Viewed: "Viewed",
  Shortlisted: "Shortlisted",
  Rejected: "Rejected",
  Withdrawn: "Withdrawn",
  Selected: "Selected",
  ConvertedToOffer: "Offer sent",
};

export const MARKETPLACE_NOTIFICATION_LABELS: Record<string, string> = {
  proposal_received: "Proposal received",
  proposal_viewed: "Proposal viewed",
  proposal_shortlisted: "Proposal shortlisted",
  proposal_rejected: "Proposal rejected",
  proposal_selected: "Proposal selected",
  proposal_message: "Proposal message",
  proposal_withdrawn: "Proposal withdrawn",
  offer_from_proposal: "Offer created",
  offer_sent: "Offer received",
  offer_accepted: "Offer accepted",
  offer_declined: "Offer declined",
};
