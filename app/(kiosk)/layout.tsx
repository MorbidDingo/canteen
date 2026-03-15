export const metadata = {
  title: "certe — Kiosk",
  description: "Student self-ordering kiosk",
};

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* certe branding header */}
      {/* <header className="bg-[#1a3a8f] text-white px-6 py-2 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
            <span className="text-[#1a3a8f] font-bold text-lg">
              <Image
                src="/cropped-logo-venus-1-2.png"
                alt="certe Logo"
                width={40}
                height={40}
                style={{ borderRadius: "20px" }}
              />
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">certe</h1>
            <p className="text-xs opacity-75">Campus Payments</p>
          </div>
        </div>
        <div className="text-right text-sm opacity-75">
          <p>Self-Order Kiosk</p>
        </div>
      </header> */}

      {/* Main content */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
