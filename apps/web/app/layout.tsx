import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata = {
  title: "EVE Electricity Witness",
  description: "Verified archive of enacted Swedish electricity market decisions and system events.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <Sidebar />
          <Topbar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
