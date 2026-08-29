import type { Clock, IdFactory, Resident, ViewPreference } from "./types";

export const seedResident: Resident = {
  id: "resident_maya_chen",
  name: "Maya Chen",
  email: "maya.chen@example.test",
  phone: "+1 555 010 2048",
  address: {
    street: "128 Harbor Lane",
    city: "Northstar",
    postalCode: "NS 20418",
  },
  vehicles: [
    {
      id: "vehicle_aurora",
      label: "2022 Aurora Hatchback",
      plate: "NST-4821",
    },
  ],
  activeParkingPermit: {
    id: "permit_2026_1148",
    vehicleId: "vehicle_aurora",
    expiresOn: "2026-09-18",
    zone: "Resident Zone B",
  },
};

export const parkingPermitFees = {
  6: 35,
  12: 60,
} as const;

export const canonicalPreferences: ViewPreference = {
  textSize: "xlarge",
  languageStyle: "plain",
  navigationStyle: "one_field_per_step",
  controlStyle: "large_cards",
  showProgress: true,
  preserveBranding: true,
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export const createClock = (now: () => Date): Clock => ({ now });

let fallbackIdSequence = 0;

const defaultIdFactory: IdFactory = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  fallbackIdSequence += 1;
  return `fallback-${fallbackIdSequence}`;
};

export const createId = (prefix: string, idFactory: IdFactory = defaultIdFactory): string =>
  `${prefix}_${idFactory()}`;

export const createIncrementingIdFactory = (startAt = 1): IdFactory => {
  let sequence = startAt;
  return () => {
    const value = sequence;
    sequence += 1;
    return String(value);
  };
};

export const cloneSeedResident = (): Resident => structuredClone(seedResident);
