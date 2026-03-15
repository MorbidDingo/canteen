export const metadata = {
  title: "certe — Library Kiosk",
  description: "Student self-service library terminal",
};

export default function LibraryKioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
