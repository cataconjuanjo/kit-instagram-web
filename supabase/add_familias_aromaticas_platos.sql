-- Añade la columna familias_aromaticas a la tabla platos
-- Almacena el perfil aromático Chartier generado automáticamente por Claude Haiku
-- Estructura: { familias: string[], ingrediente: string, tecnica: string, intensidad: number }

alter table public.platos
add column if not exists familias_aromaticas jsonb default null;

comment on column public.platos.familias_aromaticas is
'Perfil aromático Chartier generado automáticamente: {familias: string[], ingrediente: string, tecnica: string, intensidad: number}. Se calcula con Claude Haiku al guardar o editar el plato.';
