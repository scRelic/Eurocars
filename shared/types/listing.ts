export type ListingStatus = "DRAFT" | "PENDING" | "ACTIVE" | "SOLD" | "REJECTED" | "ARCHIVED";
export type FuelType = "PETROL" | "DIESEL" | "ELECTRIC" | "HYBRID" | "PLUGIN_HYBRID" | "LPG" | "CNG" | "HYDROGEN" | "OTHER";
export type Transmission = "MANUAL" | "AUTOMATIC";
export type BodyType = "SEDAN" | "SUV" | "HATCHBACK" | "WAGON" | "COUPE" | "CONVERTIBLE" | "VAN" | "PICKUP" | "OTHER";
export type CarCondition = "NEW" | "USED" | "DAMAGED";

export type ListingInput = {
  brandId: string;
  modelId: string;
  dealerId: string | null;
  title: string;
  trim: string;
  description: string;
  price: number;
  currency: "EUR" | "GBP" | "CHF";
  year: number;
  mileage: number;
  fuelType: FuelType;
  transmission: Transmission;
  bodyType: BodyType | null;
  condition: CarCondition;
  engineCapacityCc: number | null;
  powerHp: number | null;
  doors?: number | null;
  seats?: number | null;
  firstRegistration?: string | null;
  exteriorColor: string;
  interiorColor: string;
  countryCode: string;
  city: string;
  postalCode: string;
  featureIds: string[];
};

export type Listing = ListingInput & {
  id: string;
  brandName: string;
  modelName: string;
  status: ListingStatus;
  saleConfirmationStatus: "NOT_REQUESTED" | "PENDING" | "CONFIRMED" | "REJECTED";
  saleConfirmationReason: string | null;
  views: number;
  imageUrl: string | null;
  doors: number | null;
  seats: number | null;
  firstRegistration: string | null;
  images: ListingImage[];
};

export type ListingImage = { id: string; url: string; isPrimary: boolean };
export type LookupItem = { id: string; name: string };
export type Country = { code: string; name: string };
export type ListingFeature = LookupItem & { category: string };
export type ListingFormState = Omit<ListingInput, "year" | "mileage" | "price" | "doors" | "seats" | "firstRegistration"> & {
  year: number | null;
  mileage: number | null;
  price: number | null;
  doors: number | null;
  seats: number | null;
  firstRegistration: string | null;
};
export type ListingFormErrors = Partial<Record<keyof ListingFormState, string>>;
export type WizardStep = 1 | 2 | 3 | 4 | 5;
