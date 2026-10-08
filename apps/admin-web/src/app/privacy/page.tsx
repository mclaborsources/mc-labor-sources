import type { Metadata } from 'next';
import { BRAND_EMAIL, BRAND_EMAIL_HREF, BRAND_PHONE, BRAND_PHONE_HREF } from '@mc-labor/shared';
import { PublicAppPage, PublicPageSection } from '@/components/public-app-page';

export const metadata: Metadata = {
  title: 'Mobile App Privacy Policy',
  description: 'How MC Labor Sources handles information used by its employee and supervisor mobile app.',
};

export default function PrivacyPage() {
  return (
    <PublicAppPage title="Privacy policy" intro="This policy describes how MC Labor Sources, Inc. handles information through the MC Labor Sources employee and supervisor mobile app.">
      <p className="text-sm text-slate-500">Last updated: October 9, 2026</p>
      <PublicPageSection title="Information used by the app">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Account information:</strong> your name, email address, account and employee identifiers, role, and company-managed access settings.</li>
          <li><strong>Work records:</strong> assignments, job site information, clock-in and clock-out times, hours, timesheets, approvals, and safety acknowledgements.</li>
          <li><strong>Location:</strong> device coordinates and location labels associated with clock events, when location permission is granted.</li>
          <li><strong>Content:</strong> work messages, information entered into timesheets, and signatures submitted through the app.</li>
          <li><strong>Notification information:</strong> push notification tokens, device platform, and notification delivery or read information used to provide work alerts.</li>
          <li><strong>Technical information:</strong> authentication and service-request information needed to operate and protect the service. Your device also stores session information so you can remain signed in.</li>
        </ul>
        <p>Some information is provided by your company administrator, supervisor, or other authorized participants rather than entered by you.</p>
      </PublicPageSection>
      <PublicPageSection title="How information is used">
        <p>Information is used to authenticate accounts, manage access, coordinate assignments, record and verify work time, process timesheets and approvals, deliver work messages and safety notices, respond to support requests, and protect the service.</p>
      </PublicPageSection>
      <PublicPageSection title="Location and device permissions">
        <p>The app requests location access for GPS verification when you clock in or out. It does not implement continuous background location tracking. Denying location permission may prevent GPS-verified clock events.</p>
        <p>Notification permission allows work alerts to appear on your device. Photo library permission supports saving downloaded timesheet images; that permission is not used to upload your personal photo library.</p>
        <p>You can change these permissions in your device settings. Disabling a permission may limit the related feature.</p>
      </PublicPageSection>
      <PublicPageSection title="Who can receive information">
        <p>Authorized MC Labor Sources personnel and relevant supervisors or customer representatives can access work information according to their role and assignments, including records needed for timesheet review and approval.</p>
        <p>Service providers process information needed to operate the app. These include Supabase for authentication, database and file services, Expo and Apple or Google for push notifications, and hosting or email providers used for app operations and work communications.</p>
        <p>Information may also be disclosed when required by applicable law or to address security incidents and protect legal rights. The mobile app does not include advertising or cross-app advertising tracking features.</p>
      </PublicPageSection>
      <PublicPageSection title="Storage, retention, and security">
        <p>Records are stored in company-managed services and may be processed in locations where those providers operate. Access is managed through authentication and role-based permissions. No storage or transmission method can guarantee absolute security.</p>
        <p>Information is retained as needed for employment administration, timekeeping, payroll support, legal recordkeeping, resolving disputes, and operating the service. Retention depends on the record type and applicable requirements; closing an account does not necessarily delete employment records.</p>
      </PublicPageSection>
      <PublicPageSection title="Your choices and requests">
        <p>Contact MC Labor Sources to ask about your information or request access, correction, account closure, or deletion. Requests may require identity verification and may be limited by employment recordkeeping or other legal requirements.</p>
        <p>Removing the app from your device does not delete server-held work records. Sign-out availability is controlled by your company administrator; contact the office if you need assistance ending access on a device.</p>
      </PublicPageSection>
      <PublicPageSection title="Intended users and policy changes">
        <p>The app is intended for company-authorized employees and supervisors and is not directed to children under 13.</p>
        <p>This policy may be updated as app features or information practices change. The date above identifies the latest revision.</p>
      </PublicPageSection>
      <PublicPageSection title="Contact MC Labor Sources">
        <p>For privacy questions or requests, email <a className="font-semibold text-blue-700 underline" href={BRAND_EMAIL_HREF}>{BRAND_EMAIL}</a> or call <a className="font-semibold text-blue-700 underline" href={BRAND_PHONE_HREF}>{BRAND_PHONE}</a>.</p>
      </PublicPageSection>
    </PublicAppPage>
  );
}
