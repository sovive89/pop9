import { Facebook, Globe, Instagram, Music2, Youtube } from "lucide-react";
import type { SocialKey } from "../../supabase/functions/_shared/brand";

/** Redes aceitas na Marca, na ordem em que aparecem no admin e no cardápio. */
export const SOCIALS: { key: SocialKey; label: string; placeholder: string; icon: typeof Globe }[] = [
  { key: "instagram_url", label: "Instagram", placeholder: "@sualoja", icon: Instagram },
  { key: "facebook_url", label: "Facebook", placeholder: "facebook.com/sualoja", icon: Facebook },
  { key: "tiktok_url", label: "TikTok", placeholder: "@sualoja", icon: Music2 },
  { key: "youtube_url", label: "YouTube", placeholder: "@seucanal", icon: Youtube },
  { key: "website_url", label: "Site", placeholder: "sualoja.com.br", icon: Globe },
];
