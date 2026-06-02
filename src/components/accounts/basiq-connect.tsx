"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Landmark, RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Connect a bank via Basiq and sync the live feed. */
export function BasiqConnect() {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mobile, setMobile] = useState("");

  async function connect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/basiq/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connect failed");
      // Send the user to Basiq's hosted consent flow.
      window.location.href = json.consentUrl as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Basiq connect");
      setConnecting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/basiq/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      toast.success(
        `Synced ${json.accounts} account(s), ${json.transactionsProcessed} transaction(s).`,
      );
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Landmark className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">Automatic bank feed</CardTitle>
        </div>
        <CardDescription>
          Link your banks via Basiq (open banking) to pull transactions
          automatically. New transactions arrive uncategorised — review or let
          your rules categorise them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="basiq-mobile" className="text-xs">
            Mobile (for bank consent, e.g. +61412345678)
          </Label>
          <Input
            id="basiq-mobile"
            type="tel"
            inputMode="tel"
            placeholder="+61412345678"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={connecting}>
            <Link2 className="h-4 w-4" />
            {connecting ? "Starting…" : "Connect a bank"}
          </Button>
          <Button variant="outline" onClick={sync} disabled={syncing}>
            <RefreshCw
              className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
