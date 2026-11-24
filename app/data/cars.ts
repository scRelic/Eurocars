export type Car = {
  id: string;
  title?: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  price: number;
  currency?: string;
  mileage: number;
  country: string;
  city: string;
  fuel: string;
  transmission: string;
  bodyType: string;
  condition?: string;
  engine: string;
  power: number | null;
  color: string;
  description: string;
  views?: number;
  image: string | null;
  imageThumbnail?: string | null;
  images?: { id: string; url: string; thumbnailUrl?: string | null; catalogUrl?: string | null; isPrimary: boolean }[];
  features: string[];
  seller?: { id: string; name: string; avatarUrl: string | null } | null;
  dealer?: { name: string; isVerified: boolean } | null;
  featureGroups?: { name: string; items: string[] }[];
};

export type CarFilters = {
  brand: string;
  model: string;
  country: string;
  minPrice: number | null;
  maxPrice: number | null;
};

const seedCars: Car[] = [
  {
    id: "bmw-330i-2022",
    make: "BMW",
    model: "3 Series",
    trim: "330i M Sport",
    year: 2022,
    price: 34_900,
    mileage: 28_500,
    country: "Germany",
    city: "Munich",
    fuel: "Petrol",
    transmission: "Automatic",
    bodyType: "Sedan",
    engine: "2.0 L",
    power: 245,
    color: "Mineral Grey",
    description: "A dynamic sedan in excellent condition with a transparent service history and the M Sport package.",
    image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=85",
    features: ["M Sport package", "Rear-view camera", "Heated seats", "Adaptive cruise control"],
  },
  {
    id: "audi-a4-2021",
    make: "Audi",
    model: "A4",
    trim: "40 TDI quattro S line",
    year: 2021,
    price: 31_500,
    mileage: 41_200,
    country: "France",
    city: "Lyon",
    fuel: "Diesel",
    transmission: "Automatic",
    bodyType: "Sedan",
    engine: "2.0 L",
    power: 204,
    color: "Metallic Blue",
    description: "A comfortable Audi A4 with all-wheel drive, an efficient diesel engine and distinctive S line styling.",
    image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=85",
    features: ["quattro all-wheel drive", "S line", "Virtual Cockpit", "Parking sensors"],
  },
  {
    id: "mercedes-c-class-2023",
    make: "Mercedes-Benz",
    model: "C-Class",
    trim: "C 200 AMG Line",
    year: 2023,
    price: 42_900,
    mileage: 16_800,
    country: "Germany",
    city: "Berlin",
    fuel: "Petrol",
    transmission: "Automatic",
    bodyType: "Sedan",
    engine: "1.5 L",
    power: 204,
    color: "Obsidian Black",
    description: "An almost-new C-Class with the AMG Line package, a digital cockpit and advanced safety systems.",
    image: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1200&q=85",
    features: ["AMG Line", "Panoramic roof", "MBUX", "Lane-keeping assist"],
  },
  {
    id: "volkswagen-golf-2020",
    make: "Volkswagen",
    model: "Golf",
    trim: "1.5 eTSI Style",
    year: 2020,
    price: 22_400,
    mileage: 52_000,
    country: "Poland",
    city: "Warsaw",
    fuel: "Petrol / hybrid",
    transmission: "Automatic",
    bodyType: "Hatchback",
    engine: "1.5 L",
    power: 150,
    color: "White",
    description: "A versatile and economical Golf with mild-hybrid technology and a spacious interior.",
    image: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1200&q=85",
    features: ["Adaptive cruise control", "Keyless entry", "LED headlights", "Apple CarPlay"],
  },
  {
    id: "porsche-macan-2021",
    make: "Porsche",
    model: "Macan",
    trim: "2.0 PDK",
    year: 2021,
    price: 59_900,
    mileage: 36_700,
    country: "Italy",
    city: "Milan",
    fuel: "Petrol",
    transmission: "Automatic",
    bodyType: "SUV",
    engine: "2.0 L",
    power: 265,
    color: "Carrara White",
    description: "A sporty Porsche SUV with all-wheel drive, impressive performance and a generous equipment package.",
    image: "https://images.unsplash.com/photo-1614200187524-dc4b892acf16?auto=format&fit=crop&w=1200&q=85",
    features: ["All-wheel drive", "Sport seats", "Navigation", "Power tailgate"],
  },
  {
    id: "bmw-x5-2020",
    make: "BMW",
    model: "X5",
    trim: "xDrive30d",
    year: 2020,
    price: 48_700,
    mileage: 64_300,
    country: "Netherlands",
    city: "Amsterdam",
    fuel: "Diesel",
    transmission: "Automatic",
    bodyType: "SUV",
    engine: "3.0 L",
    power: 265,
    color: "Black Sapphire",
    description: "A spacious premium SUV with a powerful diesel engine, all-wheel drive and a comfortable ride.",
    image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=85&sat=-20",
    features: ["xDrive", "Leather interior", "360° cameras", "Air suspension"],
  },
  {
    id: "audi-q5-2022",
    make: "Audi",
    model: "Q5",
    trim: "45 TFSI quattro",
    year: 2022,
    price: 45_300,
    mileage: 24_900,
    country: "Germany",
    city: "Hamburg",
    fuel: "Petrol",
    transmission: "Automatic",
    bodyType: "SUV",
    engine: "2.0 L",
    power: 265,
    color: "Grey",
    description: "A modern family SUV with all-wheel drive, a spacious boot and a digital instrument cluster.",
    image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85",
    features: ["quattro", "Virtual Cockpit", "Heated steering wheel", "Power-adjustable seats"],
  },
  {
    id: "mercedes-e-class-2019",
    make: "Mercedes-Benz",
    model: "E-Class",
    trim: "E 220 d Avantgarde",
    year: 2019,
    price: 29_800,
    mileage: 78_000,
    country: "Spain",
    city: "Barcelona",
    fuel: "Diesel",
    transmission: "Automatic",
    bodyType: "Sedan",
    engine: "2.0 L",
    power: 194,
    color: "Silver",
    description: "An elegant executive sedan with low fuel consumption, a comfortable interior and a full service history.",
    image: "https://images.unsplash.com/photo-1618843479618-39b2f6f7f5a8?auto=format&fit=crop&w=1200&q=85",
    features: ["Avantgarde", "Leather interior", "Navigation", "Blind-spot monitoring"],
  },
  {
    id: "volkswagen-tiguan-2021",
    make: "Volkswagen",
    model: "Tiguan",
    trim: "2.0 TDI R-Line 4Motion",
    year: 2021,
    price: 32_600,
    mileage: 39_500,
    country: "Czechia",
    city: "Prague",
    fuel: "Diesel",
    transmission: "Automatic",
    bodyType: "SUV",
    engine: "2.0 L",
    power: 200,
    color: "Blue",
    description: "A practical Tiguan R-Line with all-wheel drive, a spacious interior and family-friendly technology.",
    image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85&hue=20",
    features: ["R-Line", "4Motion", "Third-row seating", "Park Assist"],
  },
  {
    id: "porsche-911-2018",
    make: "Porsche",
    model: "911",
    trim: "Carrera 4",
    year: 2018,
    price: 89_500,
    mileage: 31_600,
    country: "Austria",
    city: "Vienna",
    fuel: "Petrol",
    transmission: "Automatic",
    bodyType: "Coupe",
    engine: "3.0 L",
    power: 370,
    color: "Guards Red",
    description: "The iconic Porsche 911 Carrera 4 sports car with all-wheel drive and an impeccable condition.",
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85",
    features: ["All-wheel drive", "Sport exhaust", "Sport seats", "Sport Chrono package"],
  },
  {
    id: "skoda-octavia-2022",
    make: "Škoda",
    model: "Octavia",
    trim: "2.0 TDI Style",
    year: 2022,
    price: 25_900,
    mileage: 33_100,
    country: "Poland",
    city: "Krakow",
    fuel: "Diesel",
    transmission: "Automatic",
    bodyType: "Liftback",
    engine: "2.0 L",
    power: 150,
    color: "Graphite Grey",
    description: "A spacious Octavia with a large boot, an economical engine and a useful set of features.",
    image: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1200&q=85&sat=-30",
    features: ["Virtual Cockpit", "Heated seats", "Parking sensors", "Adaptive cruise control"],
  },
  {
    id: "volvo-xc60-2021",
    make: "Volvo",
    model: "XC60",
    trim: "B5 AWD Inscription",
    year: 2021,
    price: 43_800,
    mileage: 47_200,
    country: "Sweden",
    city: "Stockholm",
    fuel: "Petrol / hybrid",
    transmission: "Automatic",
    bodyType: "SUV",
    engine: "2.0 L",
    power: 250,
    color: "Light Grey",
    description: "A safe and comfortable Volvo SUV with mild-hybrid technology and Inscription trim.",
    image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=85&sat=15",
    features: ["AWD", "Panoramic roof", "Safety package", "Harman Kardon sound system"],
  },
];

const additionalLocations = [
  { country: "Germany", city: "Frankfurt" },
  { country: "France", city: "Paris" },
  { country: "Poland", city: "Gdansk" },
  { country: "Italy", city: "Rome" },
  { country: "Netherlands", city: "Rotterdam" },
  { country: "Spain", city: "Madrid" },
  { country: "Czechia", city: "Brno" },
  { country: "Austria", city: "Salzburg" },
  { country: "Sweden", city: "Gothenburg" },
  { country: "Belgium", city: "Brussels" },
  { country: "Portugal", city: "Lisbon" },
  { country: "Denmark", city: "Copenhagen" },
];

const additionalColors = ["Sapphire Blue", "Alpine White", "Carbon Black", "Silver Metallic", "British Racing Green", "Graphite Grey"];
const priceAdjustments = [0.94, 1.04, 0.89, 1.08];
const mileageAdjustments = [12_000, -7_000, 24_000, 5_000];

const additionalCars = seedCars.flatMap((car, index) =>
  priceAdjustments.map((priceAdjustment, variationIndex) => {
    const location = additionalLocations[(index + variationIndex) % additionalLocations.length]!;
    const imageCar = seedCars[(index + variationIndex * 3 + 1) % seedCars.length]!;

    return {
      ...car,
      id: `${car.id}-alt-${variationIndex + 1}`,
      year: Math.max(2017, car.year - ((index + variationIndex) % 4)),
      price: Math.round((car.price * priceAdjustment) / 100) * 100,
      mileage: Math.max(5_000, car.mileage + mileageAdjustments[variationIndex]!),
      country: location.country,
      city: location.city,
      color: additionalColors[(index + variationIndex) % additionalColors.length]!,
      description: `Sample ${car.make} ${car.model} listing in ${location.city}, featuring a ${car.fuel.toLowerCase()} engine and ${car.bodyType.toLowerCase()} body style.`,
      image: imageCar.image,
    };
  }),
);

export const cars: Car[] = [...seedCars, ...additionalCars];