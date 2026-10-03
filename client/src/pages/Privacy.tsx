import { LegalLayout } from '@/components/LegalLayout'

export default function Privacy() {
  return (
    <LegalLayout title="Privacy policy" updated="3 October 2026">
      <p>
        FixNest is a hostel maintenance and complaint tracker built for the hostel at I2IT, Pune. Students report problems, and the
        hostel office and maintenance staff fix them. This page explains what information FixNest keeps, who can see it, and
        what you can do about it.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, your college email address, and either a password (kept only as a one-way
          scrambled value, never as the password itself) or your Google account identifier if you sign in with Google.
        </li>
        <li>
          <strong>If you use Google sign-in:</strong> Google tells us your name, email address and profile picture. We receive
          nothing else from your Google account: no mail, files, contacts or calendar.
        </li>
        <li>
          <strong>Where you stay:</strong> the hostel name and room number you type, and when you last changed them.
        </li>
        <li>
          <strong>Optional details:</strong> a profile picture you upload and a mobile number you add. You choose whether to give
          these.
        </li>
        <li>
          <strong>Your complaints:</strong> what you write, the category, the priority, the place, photos or videos you attach,
          progress notes, and the history of every change.
        </li>
        <li>
          <strong>Your devices:</strong> each time you log in we note the type of browser and device (for example "Chrome on
          Windows"), the internet address (IP address) it connected from, and when it was last used. This is what the "Active
          devices" list in Settings shows, so you can log out a device you do not recognise.
        </li>
        <li>
          <strong>Email:</strong> we email you sign-up codes, password reset links and updates about your complaints. We keep
          whether each email was sent.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        FixNest sets one cookie, which keeps you logged in on that device for up to 7 days. There are no advertising cookies,
        no tracking and no analytics.
      </p>

      <h2>Why we use it</h2>
      <p>
        Only to run FixNest: to know who you are, where a problem is, who should fix it, and to keep you informed. We do not sell
        your information and we do not show advertising.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>You</strong> can see everything about your own account and complaints.
        </li>
        <li>
          <strong>Maintenance staff</strong> see the complaints assigned to them: the description, photos or videos, the place,
          your name, and the notes on it.
        </li>
        <li>
          <strong>Wardens and administrators</strong> see all complaints and the details of students: name, email address, hostel
          and room, and mobile number if you added one.
        </li>
        <li>
          <strong>Other students</strong> cannot see your complaints or details.
        </li>
        <li>
          <strong>Services that help run FixNest:</strong> Google (for sign-in), the email delivery service that sends our emails,
          and the server that stores the data. We do not share your information with anyone else, except where the law
          requires it.
        </li>
      </ul>

      <h2>Photos and videos</h2>
      <p>
        Pictures and videos attached to a complaint can be opened only by people who can see that complaint. Photos are
        re-saved without hidden camera information such as location. Videos are stored exactly as recorded, so a video from a
        phone may still contain its location.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Complaints are kept as a permanent record of the hostel's maintenance history, and nobody, including administrators, can
          delete them. This stops a record from being quietly changed or removed.
        </li>
        <li>You can remove your profile picture and your mobile number yourself at any time in Settings.</li>
        <li>
          When you leave the hostel, the warden can deactivate your account. A deactivated account cannot log in.
        </li>
      </ul>

      <h2>How it is protected</h2>
      <p>
        FixNest is served over HTTPS. Passwords are never stored in readable form. Each role can see only what it needs, and this
        is enforced by the server, not only by the screens. Repeated wrong passwords temporarily lock sign-in, and you can log
        out any device from Settings.
      </p>

      <h2>Questions or requests</h2>
      <p>
        To ask what we hold about you, to correct it, or to ask for your account to be deactivated, speak to the hostel warden,
        who can reach the FixNest administrator. If this page changes in a way that matters, the date at the top will change.
      </p>
    </LegalLayout>
  )
}
