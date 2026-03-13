export default function OfflinePage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-bold text-[#1a3a8f]">You are offline</h1>
        <p className="text-muted-foreground">
          Cached screens are still available. New transactions will be queued locally and synced when the network returns.
        </p>
      </div>
    </div>
  );
}
