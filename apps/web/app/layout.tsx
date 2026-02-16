import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata = {
  title: "ELEKTO — Energy Transparency Platform",
  description: "Open, neutral, evidence-driven energy data. No opinions. Only data + method.",
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
