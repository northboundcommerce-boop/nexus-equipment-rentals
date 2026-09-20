NEXUS EQUIPMENT RENTALS — VERIFICATION UPDATE

FILES TO UPLOAD TO GITHUB:
- portal.js
- portal.css
- SUPABASE-VERIFICATION-SETUP.sql (reference/setup file; safe to keep in repo)

DO NOT replace your existing supabase-config.js.

SETUP:
1. Open Supabase -> SQL Editor.
2. Paste/run SUPABASE-VERIFICATION-SETUP.sql once.
3. Replace portal.js and portal.css in the rental website repo.
4. Commit to main and let Vercel redeploy.
5. Sign in as a customer and complete Identity Verification.

SECURITY:
- Driver's license files go into a PRIVATE Supabase Storage bucket.
- The database stores only the LAST FOUR digits of SSN/EIN.
- This patch does NOT retain the full SSN/EIN.
- For production verification of full SSNs, integrate a dedicated identity-verification provider rather than storing raw SSNs in this website.
