import { CircleHelp, CreditCard, FileText, Home, ParkingSquare, Trash2 } from "lucide-react";

const navItems = [
  ["Home", Home],
  ["Payments", CreditCard],
  ["Permits", ParkingSquare],
  ["Records", FileText],
  ["Waste & Utilities", Trash2],
  ["Help", CircleHelp],
] as const;

export const PortalSidebar = () => (
  <nav className="portal-sidebar" aria-label="Northstar City services">
    <p className="nav-label">Resident portal</p>
    <ul>
      {navItems.map(([label, Icon], index) => (
        <li key={label}>
          <a
            href={`#${label.toLowerCase().replaceAll(" ", "-")}`}
            aria-current={index === 0 ? "page" : undefined}
          >
            <Icon size={18} /> {label}
          </a>
        </li>
      ))}
    </ul>
    <div className="resident-chip">
      <span aria-hidden="true">MC</span>
      <p>
        <strong>Maya Chen</strong>
        <small>Resident account</small>
      </p>
    </div>
  </nav>
);
