export function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-title">EVE — Electricity Witness</div>
      <div className="topbar-status">
        <span>ENTSO-E: awaiting first fetch</span>
        <span>|</span>
        <span>Witness: seed v1</span>
      </div>
    </header>
  );
}
