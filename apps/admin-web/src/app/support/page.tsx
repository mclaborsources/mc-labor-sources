import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_EMAIL, BRAND_EMAIL_HREF, BRAND_PHONE, BRAND_PHONE_HREF } from '@mc-labor/shared';
import { PublicAppPage, PublicPageSection } from '@/components/public-app-page';

export const metadata: Metadata = {
  title: 'Mobile App Support',
  description: 'Get help with your MC Labor Sources account, assignments, clock events, and timesheets.',
};

export default function SupportPage() {
  return (
    <PublicAppPage title="How can we help?" intro="Contact MC Labor Sources for help with the mobile app or your employee account.">
      <PublicPageSection title="Contact support">
        <p>Email: <a className="font-semibold text-blue-700 underline" href={BRAND_EMAIL_HREF}>{BRAND_EMAIL}</a></p>
        <p>Phone: <a className="font-semibold text-blue-700 underline" href={BRAND_PHONE_HREF}>{BRAND_PHONE}</a></p>
        <p>Include your name, the feature you need help with, and a description of the issue. You may include your app version and device model. Never send your password or sensitive employee records by email.</p>
      </PublicPageSection>
      <PublicPageSection title="Signing in and account access">
        <p>Employee and supervisor accounts are provided by MC Labor Sources. Contact the office if you need an account, cannot sign in, need a password reset, or need help signing out. Sign-out availability is managed by your company administrator.</p>
      </PublicPageSection>
      <PublicPageSection title="Clock in, clock out, and work hours">
        <p>Allow location access when prompted so the app can verify your location during clock events. If your location is unavailable, check your device’s location settings and internet connection, then try again.</p>
        <p>If a clock event or timesheet is incorrect, contact the office with the work date, job site, and the correction you are requesting.</p>
      </PublicPageSection>
      <PublicPageSection title="Assignments, messages, and notifications">
        <p>Contact the office if an assignment is missing or a job detail needs updating. To receive push alerts, allow notifications in your device settings. You can also open the app to review company messages and safety updates.</p>
      </PublicPageSection>
      <PublicPageSection title="Privacy and account requests">
        <p>For questions about your information, or to request access, a correction, account closure, or deletion, contact support using the details above. Some employment and payroll records may need to be retained even after account access ends.</p>
        <p><Link className="font-semibold text-blue-700 underline" href="/privacy">Read the mobile app privacy policy</Link>.</p>
      </PublicPageSection>
    </PublicAppPage>
  );
}
