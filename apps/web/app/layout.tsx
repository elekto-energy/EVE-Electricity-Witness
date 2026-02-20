import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata = {
  title: "EVE Electricity Witness",
  description: "Verified archive of enacted Swedish electricity market decisions and system events.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('eve-theme')||'light';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`,
          }}
        />
      </head>
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
