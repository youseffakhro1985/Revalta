export type OnboardingStepId =
  | "company"
  | "property"
  | "team"
  | "ticket-intake"
  | "notifications";

export type OnboardingSignals = {
  companyConfigured: boolean;
  propertyCount: number;
  activeTeamMembers: number;
  pendingTeamInvites: number;
  ticketIntakeVerified: boolean;
  notificationSettingsUpdatedAt: string | null;
};

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  completed: boolean;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
  complete: boolean;
};

export function buildOnboardingProgress(signals: OnboardingSignals): OnboardingProgress {
  const steps: OnboardingStep[] = [
    {
      id: "company",
      title: "Företagsuppgifter",
      description: "Kontrollera organisationsnamn och organisationsnummer.",
      href: "/dashboard/installningar",
      actionLabel: "Öppna företagsuppgifter",
      completed: signals.companyConfigured,
    },
    {
      id: "property",
      title: "Lägg till första fastigheten",
      description: "Skapa den första fastigheten som resten av arbetsytan kan utgå från.",
      href: "/dashboard/fastigheter/ny",
      actionLabel: "Lägg till fastighet",
      completed: signals.propertyCount > 0,
    },
    {
      id: "team",
      title: "Bjud in team",
      description: "Bjud in minst en kollega eller skapa en väntande teaminbjudan.",
      href: "/dashboard/team",
      actionLabel: "Hantera team",
      completed: signals.activeTeamMembers > 1 || signals.pendingTeamInvites > 0,
    },
    {
      id: "ticket-intake",
      title: "Konfigurera felanmälan",
      description: "Verifiera att fastighetens felanmälan och boendeflöde är redo innan ni börjar ta emot ärenden.",
      href: "/dashboard/boendeportal",
      actionLabel: "Kontrollera felanmälan",
      completed: signals.ticketIntakeVerified,
    },
    {
      id: "notifications",
      title: "Notifieringsinställningar",
      description: "Spara organisationens service- och notifieringsinställningar.",
      href: "/dashboard/installningar/aviseringar",
      actionLabel: "Öppna notifieringar",
      completed: Boolean(signals.notificationSettingsUpdatedAt),
    },
  ];

  const completedCount = steps.filter((step) => step.completed).length;
  const totalCount = steps.length;

  return {
    steps,
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
    complete: completedCount === totalCount,
  };
}
