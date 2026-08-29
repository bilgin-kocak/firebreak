import {
  ArrowRight,
  BadgeDollarSign,
  Bike,
  CalendarClock,
  FileSearch,
  Home,
  ParkingSquare,
} from "lucide-react";

import type { ServiceId } from "../domain/types";
import { DemoPromptCard } from "./DemoPromptCard";

export const PROMPT_A =
  "Renew my parking permit. I have low vision and want plain language, extra-large controls, one question per screen, and no submission without my approval. Use my current vehicle and email contact. Build the interface, verify it, then propose a reusable tool called `renew_permit_guided`.";
export const PROMPT_B = "Use the new `renew_permit_guided` tool for a 12-month permit.";

interface ServiceDashboardProps {
  onStart(serviceId: ServiceId): void;
  onCopied(message: string): void;
}

const services = [
  {
    title: "Parking Permit Renewal",
    description: "Renew a resident parking permit and review the fee before submitting.",
    icon: ParkingSquare,
    serviceId: "parking_permit_renewal" as const,
  },
  {
    title: "Address Change",
    description: "Update the home address connected to your fictional resident record.",
    icon: Home,
    serviceId: "address_change" as const,
  },
  {
    title: "Property Tax Lookup",
    description: "View due dates and understand a fictional property tax notice.",
    icon: BadgeDollarSign,
  },
  {
    title: "Waste Collection Schedule",
    description: "Check upcoming recycling and household waste collection dates.",
    icon: CalendarClock,
  },
  {
    title: "Building Permit Guide",
    description: "Learn which documents a small home project may require.",
    icon: FileSearch,
  },
  {
    title: "Recreation Programs",
    description: "Browse seasonal classes and community recreation information.",
    icon: Bike,
  },
];

export const ServiceDashboard = ({ onStart, onCopied }: ServiceDashboardProps) => (
  <div className="dashboard-view">
    <section className="welcome-panel" aria-labelledby="welcome-title">
      <div>
        <p className="eyebrow">Friday, August 29</p>
        <h1 id="welcome-title">Welcome, Maya Chen</h1>
        <p>Access your resident services, records, and saved drafts in one place.</p>
      </div>
      <div className="deadline-card">
        <span className="deadline-date">
          <strong>18</strong>SEP
        </span>
        <p>
          <strong>Parking permit expires soon</strong>
          <span>Resident Zone B · 20 days remaining</span>
        </p>
      </div>
    </section>

    <section className="prompt-section" aria-labelledby="try-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Agent-assisted path</p>
          <h2 id="try-title">Try with ChatGPT</h2>
        </div>
        <span className="safe-note">No code generation · Human approval required</span>
      </div>
      <div className="prompt-grid">
        <DemoPromptCard
          number={1}
          title="Build a guided permit journey"
          prompt={PROMPT_A}
          onCopied={onCopied}
        />
        <DemoPromptCard
          number={2}
          title="Use the tool you approved"
          prompt={PROMPT_B}
          onCopied={onCopied}
        />
      </div>
      <div className="capability-ribbon" aria-label="CivicWeave safety path">
        {[
          ["Intent", "Your goal"],
          ["Trusted fields", "Portal-owned"],
          ["Checks", "Deterministic"],
          ["Live tool", "Human-approved"],
        ].map(([title, detail], index) => (
          <div className="ribbon-stage" key={title}>
            <span>{index + 1}</span>
            <p>
              <strong>{title}</strong>
              <small>{detail}</small>
            </p>
          </div>
        ))}
      </div>
    </section>

    <section aria-labelledby="services-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Common tasks</p>
          <h2 id="services-title">City services</h2>
        </div>
        <a href="#all-services">
          View all services <ArrowRight size={16} />
        </a>
      </div>
      <div className="service-grid">
        {services.map(({ title, description, icon: Icon, serviceId }) => (
          <article className="service-card" data-testid="service-card" key={title}>
            <span className="service-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
            {serviceId ? (
              <button
                className="service-link"
                type="button"
                onClick={() => onStart(serviceId)}
                aria-label={`Start ${title}`}
              >
                Start service <ArrowRight size={16} />
              </button>
            ) : (
              <span className="info-only">Information only in this demo</span>
            )}
          </article>
        ))}
      </div>
    </section>
  </div>
);
