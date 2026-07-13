export interface MonetaryAmount {
  "@type": "MonetaryAmount";
  currency: string;
  value: number;
}

export interface Participant {
  "@type": "Person" | "Organization";
  identifier: string;
  name: string;
}

export interface RevenueObservation {
  "@type": "Observation";
  observationAbout: Participant;
  observationDate: string;
  variableMeasured: string;
  value: MonetaryAmount;
}

export interface ClaimInterpreter {
  "@type": "Organization" | "Person";
  identifier: string;
  name: string;
}

export interface RevenueFactStatement {
  "@context": "https://schema.org";
  "@type": "Claim";
  identifier: string;
  dateCreated: string;
  temporalCoverage: string;
  text: string;
  about: RevenueObservation;
  claimInterpreter: ClaimInterpreter;
}
