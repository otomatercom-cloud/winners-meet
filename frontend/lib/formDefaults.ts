/** Default label / hint of every field on the public registration form. An event can override any of them. */
export const FORM_TEXT_DEFAULTS: Record<string, { name: string; label: string; hint?: string }> = {
  name: { name: "Full name", label: "Full name" },
  phone: { name: "WhatsApp number", label: "WhatsApp number", hint: "Your entry pass and seat details will be sent here." },
  institution: { name: "School / institution", label: "School / institution" },
  email: { name: "Email", label: "Email" },
  place: { name: "Place", label: "Place" },
  instagram: { name: "Instagram", label: "Instagram ID", hint: "So we can tag you in your event photos." },
  photo: { name: "Photo", label: "Your photo", hint: "A clear face photo. It is shown at the entry desk." },
  bio: { name: "Short profile", label: "Short profile", hint: "Write a short paragraph about yourself, your teaching and achievements." },
  profile: { name: "Profile document", label: "Profile document (Word / PDF)" },
  contact: { name: "Point of contact", label: "Point of contact" },
  food_pref: { name: "Food preference", label: "Food preference" },
  accompany: { name: "Coming with", label: "Will anyone accompany you? / Accompanied by" },
};
