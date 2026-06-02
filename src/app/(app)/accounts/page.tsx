import { AccountsManager } from "@/components/accounts/accounts-manager";
import { BasiqConnect } from "@/components/accounts/basiq-connect";

// Basiq is parked until this app is productised under a business/CDR arrangement
// (Basiq is B2B-only). Flip NEXT_PUBLIC_BASIQ_ENABLED=true to re-enable the card.
const basiqEnabled = process.env.NEXT_PUBLIC_BASIQ_ENABLED === "true";

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      {basiqEnabled ? <BasiqConnect /> : null}
      <AccountsManager />
    </div>
  );
}
