-- Nexus Equipment Rentals: secure verification setup
-- Run this ONCE in Supabase SQL Editor.
-- IMPORTANT: This design intentionally stores only the LAST FOUR of SSN/EIN.
-- Do not add a full SSN column to this table.

create table if not exists public.customer_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  legal_first_name text,
  legal_last_name text,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  license_number text,
  license_state text,
  license_expiration date,
  tax_id_type text check (tax_id_type in ('ssn','ein')),
  tax_id_last4 text check (tax_id_last4 is null or tax_id_last4 ~ '^[0-9]{4}$'),
  license_front_path text,
  license_back_path text,
  status text not null default 'not_submitted'
    check (status in ('not_submitted','under_review','verified','needs_attention','rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_verifications enable row level security;

drop policy if exists "Customers read own verification" on public.customer_verifications;
create policy "Customers read own verification"
on public.customer_verifications for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Customers create own verification" on public.customer_verifications;
create policy "Customers create own verification"
on public.customer_verifications for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Customers update own verification" on public.customer_verifications;
create policy "Customers update own verification"
on public.customer_verifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admins update verification" on public.customer_verifications;
create policy "Admins update verification"
on public.customer_verifications for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Private document bucket.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'customer-verification-documents',
  'customer-verification-documents',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public=false,
  file_size_limit=8388608,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "Customers upload own verification docs" on storage.objects;
create policy "Customers upload own verification docs"
on storage.objects for insert to authenticated
with check (
  bucket_id='customer-verification-documents'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "Customers update own verification docs" on storage.objects;
create policy "Customers update own verification docs"
on storage.objects for update to authenticated
using (
  bucket_id='customer-verification-documents'
  and (storage.foldername(name))[1]=auth.uid()::text
)
with check (
  bucket_id='customer-verification-documents'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "Customers read own verification docs" on storage.objects;
create policy "Customers read own verification docs"
on storage.objects for select to authenticated
using (
  bucket_id='customer-verification-documents'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);

drop policy if exists "Admins delete verification docs" on storage.objects;
create policy "Admins delete verification docs"
on storage.objects for delete to authenticated
using (
  bucket_id='customer-verification-documents'
  and public.is_admin()
);
