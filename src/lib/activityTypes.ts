export type ActivityCategory = "deslocamento" | "estacionario";

export interface ActivityType {
  id: string;
  name: string;
  category: ActivityCategory;
  usesGps: boolean;
  usesDistance: boolean;
  metValue: number; // Metabolic Equivalent of Task
}

export const ACTIVITY_TYPES: ActivityType[] = [
  {
    id: "corrida",
    name: "Corrida",
    category: "deslocamento",
    usesGps: true,
    usesDistance: true,
    metValue: 8.0,
  },
  {
    id: "caminhada",
    name: "Caminhada",
    category: "deslocamento",
    usesGps: true,
    usesDistance: true,
    metValue: 3.5,
  },
  {
    id: "ciclismo",
    name: "Ciclismo",
    category: "deslocamento",
    usesGps: true,
    usesDistance: true,
    metValue: 7.5,
  },
  {
    id: "trilha",
    name: "Trilha",
    category: "deslocamento",
    usesGps: true,
    usesDistance: true,
    metValue: 6.0,
  },
  {
    id: "musculacao",
    name: "Musculação",
    category: "estacionario",
    usesGps: false,
    usesDistance: false,
    metValue: 5.0,
  },
  {
    id: "funcional",
    name: "Funcional",
    category: "estacionario",
    usesGps: false,
    usesDistance: false,
    metValue: 6.0,
  },
  {
    id: "crossfit",
    name: "Cross Training",
    category: "estacionario",
    usesGps: false,
    usesDistance: false,
    metValue: 8.0,
  },
  {
    id: "yoga",
    name: "Yoga",
    category: "estacionario",
    usesGps: false,
    usesDistance: false,
    metValue: 2.5,
  },
  {
    id: "alongamento",
    name: "Alongamento",
    category: "estacionario",
    usesGps: false,
    usesDistance: false,
    metValue: 2.3,
  },
];

export const getActivityTypeById = (id: string): ActivityType | null => {
  return ACTIVITY_TYPES.find((activity) => activity.id === id) ?? null;
};
