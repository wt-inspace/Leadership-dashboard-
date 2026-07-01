export default function DemoBanner() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <span className="font-semibold">Demo mode</span> — displaying deterministic sample data.
      Set <code className="rounded bg-black/30 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
      (and unset <code className="rounded bg-black/30 px-1 py-0.5 text-xs">DEMO_MODE</code>) to
      connect live data.
    </div>
  );
}
