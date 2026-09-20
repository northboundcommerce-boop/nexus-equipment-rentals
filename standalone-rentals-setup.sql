-- Nexus Equipment Rentals standalone site
-- Run once in the existing Nexus Supabase project.
alter table public.equipment enable row level security;
drop policy if exists "Public can view rental equipment" on public.equipment;
create policy "Public can view rental equipment"
on public.equipment for select to anon, authenticated
using (status <> 'inactive');
