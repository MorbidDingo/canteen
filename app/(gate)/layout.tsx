export const metadata = {
  title: "certe — Gate",
  description: "Student entry/exit gate verification",
};

export default function GateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
