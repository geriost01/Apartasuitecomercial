-- Permit authenticated staff to delete a booking only when the app's history checks allow it.
-- Foreign keys remain the final guard against deleting rows with linked records.
drop policy if exists bookings_staff_delete on public.bookings;
create policy bookings_staff_delete on public.bookings
for delete to authenticated
using (public.la_flora_is_staff());
