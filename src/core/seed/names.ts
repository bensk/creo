// Synthetic name pools for seed data. Combinations are random; any match to a
// real person is coincidental. Never add names taken from real records.

export const GIRL_NAMES = [
  "Aaliyah", "Abigail", "Ailani", "Alondra", "Amara", "Amira", "Ashley", "Ayesha", "Brianna", "Camila",
  "Chloe", "Daniela", "Destiny", "Emely", "Esperanza", "Fatima", "Genesis", "Gianna", "Imani", "Isabella",
  "Jada", "Jasmine", "Kayla", "Khadija", "Leah", "Luz", "Madison", "Maryam", "Mia", "Nadia",
  "Nevaeh", "Nia", "Paola", "Sanaa", "Sofia", "Tiana", "Valentina", "Yamilet", "Zainab", "Zuri",
] as const;

export const BOY_NAMES = [
  "Aaron", "Abdullah", "Adrian", "Amir", "Angel", "Anthony", "Bryan", "Carlos", "Christopher", "Daniel",
  "Darius", "David", "Dylan", "Elijah", "Emmanuel", "Ethan", "Gabriel", "Ibrahim", "Isaiah", "Jayden",
  "Jesus", "Jonathan", "Josiah", "Juan", "Justin", "Kevin", "Kofi", "Liam", "Luis", "Malik",
  "Mamadou", "Mateo", "Moussa", "Omar", "Rafael", "Samuel", "Sebastian", "Tyrese", "Xavier", "Yusuf",
] as const;

export const WOMEN_NAMES = [
  "Ana", "Aminata", "Angela", "Carmen", "Crystal", "Diana", "Ebony", "Elena", "Fatoumata", "Gloria",
  "Ines", "Jacqueline", "Keisha", "Latoya", "Lisette", "Maria", "Mariama", "Marisol", "Nancy", "Rosa",
  "Sandra", "Shanice", "Tamika", "Wendy", "Yolanda",
] as const;

export const MEN_NAMES = [
  "Abdoulaye", "Alberto", "Andre", "Antonio", "Derrick", "Eduardo", "Francisco", "Hector", "Jamal", "Jorge",
  "Jose", "Kareem", "Kwame", "Manuel", "Marcus", "Miguel", "Ousmane", "Pedro", "Ramon", "Terrence",
] as const;

export const SURNAMES = [
  "Acevedo", "Adeyemi", "Ali", "Almonte", "Bah", "Baez", "Barry", "Batista", "Brown", "Camara",
  "Castillo", "Cruz", "Davis", "De Jesus", "Diallo", "Diaz", "Encarnacion", "Espinal", "Fernandez", "Garcia",
  "Gomez", "Green", "Guzman", "Harris", "Hernandez", "Hossain", "Jackson", "Jimenez", "Johnson", "Jones",
  "Kamara", "Lopez", "Martinez", "Mendez", "Miah", "Morales", "Nunez", "Ortiz", "Owusu", "Perez",
  "Polanco", "Ramirez", "Reyes", "Rivera", "Robinson", "Rodriguez", "Rosario", "Santana", "Santos", "Sow",
  "Taveras", "Thomas", "Torres", "Traore", "Vasquez", "Walker", "Washington", "Williams", "Ventura", "Ynoa",
] as const;

// Homerooms are named after colleges. Syracuse is a 7th grade homeroom because
// the teacher test user's homeroom is defined that way.
export const HOMEROOMS: Readonly<Record<5 | 6 | 7 | 8, readonly string[]>> = {
  5: ["Bloomfield", "Macaulay", "Fordham", "Spelman"],
  6: ["Cornell", "Howard", "Lehman", "Wesleyan"],
  7: ["Syracuse", "NCA&T", "Hunter", "Morehouse"],
  8: ["Columbia", "Binghamton", "Barnard", "Hampton"],
};

/** "José De Jesús" → "jose.dejesus" */
export function emailSlug(...parts: string[]): string {
  return parts
    .map((p) =>
      p
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    )
    .join(".");
}
