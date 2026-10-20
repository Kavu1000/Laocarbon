// Shape of /api/marketplace/participants.
export type Participant = { wallet: string; name: string | null; avatarUrl: string | null; verified: boolean };
export type ListingParticipants = {
  retiredTons: string;
  buyerCount: number;
  buyers: (Participant & { tons: string })[]; // largest first, capped
};
export type ParticipantsResponse = {
  listings: Record<string, ListingParticipants>;
  owners: Record<string, Participant>; // by projectId
};
