# Nexus Equipment Rentals — Standalone Website

Standalone site for the rental company.

Pages:
- `/` luxury rental homepage
- `/equipment.html` live Supabase inventory
- `/contact.html`
- `/portal.html` existing customer/admin rental portal

Important setup:
1. Create a NEW GitHub repository and NEW Vercel project for Nexus Equipment Rentals.
2. Copy your EXISTING working `supabase-config.js` from the current Nexus website into this project. Do not use a secret/service-role key.
3. Run `standalone-rentals-setup.sql` once in the existing Nexus Supabase project.
4. Deploy.
5. After the new rental domain is live, change the Rentals navigation link on the Nexus Group website to the new rental website URL.

Equipment is still managed from the same Supabase-backed admin portal, so adding/updating equipment updates the standalone website.
