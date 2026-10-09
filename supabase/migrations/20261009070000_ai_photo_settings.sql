CREATE TABLE IF NOT EXISTS public.ai_photo_settings (
 business_unit_id uuid PRIMARY KEY REFERENCES public.business_units(id) ON DELETE CASCADE,
 style text NOT NULL DEFAULT 'studio' CHECK (style IN ('studio','dark','natural','catalog')),
 angle text NOT NULL DEFAULT 'three-quarter' CHECK (angle IN ('three-quarter','front','top')),
 lighting text NOT NULL DEFAULT 'soft' CHECK (lighting IN ('soft','natural','dramatic')),
 custom text NOT NULL DEFAULT '' CHECK (char_length(custom)<=250),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_photo_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_photo_settings FROM anon, authenticated;
