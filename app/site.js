// Details shown on the public pages. Set PIPP_EMAIL in Vercel before submitting the app to Meta.
export const SITE = {
  name: 'pipp',
  contactEmail: process.env.PIPP_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || '[CONTACT EMAIL]',
  policyDate: 'October 17, 2026',
};
