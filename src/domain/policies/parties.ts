/** True when the user is the seller of the opportunity (a party cannot act as its own counterparty). */
export function isPartyConflict(userId: string, opportunity: { sellerId: string }): boolean {
  return userId === opportunity.sellerId;
}
