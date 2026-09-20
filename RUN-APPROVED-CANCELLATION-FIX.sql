-- Allow customers to cancel legacy APPROVED reservations too.
-- Run in Supabase SQL Editor.

alter table public.rental_requests drop constraint if exists rental_requests_status_check;
alter table public.rental_requests
  add constraint rental_requests_status_check
  check (status in (
    'pending','approved','contract_required','confirmed',
    'rejected','cancelled','active','completed'
  ));

drop policy if exists "Customers can cancel own rental requests" on public.rental_requests;
create policy "Customers can cancel own rental requests"
on public.rental_requests
for update to authenticated
using (
  auth.uid() = customer_id
  and status in ('pending','approved','contract_required','confirmed')
)
with check (
  auth.uid() = customer_id
  and status = 'cancelled'
);
