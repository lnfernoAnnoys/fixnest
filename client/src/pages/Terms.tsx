import { Link } from 'react-router-dom'
import { LegalLayout } from '@/components/LegalLayout'

export default function Terms() {
  return (
    <LegalLayout title="Terms of service" updated="3 October 2026">
      <p>
        These are the rules for using FixNest, the hostel maintenance and complaint tracker for the hostel at I2IT, Pune. By
        creating an account or logging in, you agree to them.
      </p>

      <h2>Who can use it</h2>
      <p>
        Students of the hostel, with their college email address. Maintenance staff, wardens and administrators have accounts
        created for them by the administrator.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>One account is for one person. Do not share your password, and do not use someone else's account.</li>
        <li>You are responsible for what is done with your account. If you do not recognise a device in Settings, log it out.</li>
        <li>Keep your details correct, including the hostel and room you stay in.</li>
      </ul>

      <h2>Use it honestly</h2>
      <ul>
        <li>Report real problems only, and describe them truthfully.</li>
        <li>
          Choose the priority honestly. High and Urgent are for problems that cannot wait. Choosing a higher priority just to be
          served sooner is misuse: the warden may lower it, and the hostel may take action against repeated misuse.
        </li>
        <li>
          Do not upload anything illegal or offensive, or pictures or videos of people who have not agreed to it.
        </li>
        <li>
          Do not try to break, overload or get around FixNest, or to see other people's information.
        </li>
      </ul>

      <h2>What you upload</h2>
      <p>
        What you write and upload stays yours. By posting a complaint you let FixNest and the hostel office store it and use it
        to deal with your complaint. Complaints are kept as a permanent record and cannot be deleted.
      </p>

      <h2>Emergencies</h2>
      <p>
        <strong>Do not use FixNest for an emergency.</strong> For fire, injury, a medical problem or any danger to people, call the
        warden or the emergency services straight away. FixNest is for maintenance problems, and a complaint may not be seen at
        once.
      </p>

      <h2>Availability</h2>
      <p>
        FixNest is a college project and is provided as it is. We try to keep it running and correct, but we do not promise that
        it will always be available or free of mistakes, and it may change or stop.
      </p>

      <h2>Suspending accounts</h2>
      <p>The warden or administrator may deactivate an account that breaks these terms.</p>

      <h2>Limits on responsibility</h2>
      <p>
        As far as the law allows, the people who run FixNest are not responsible for losses that come from using it or from it
        not being available. Nothing here limits any right you have that cannot be limited by law.
      </p>

      <h2>Changes and questions</h2>
      <p>
        If these terms change in a way that matters, the date at the top will change. For questions, speak to the hostel warden.
        See also the <Link to="/privacy">privacy policy</Link>.
      </p>
    </LegalLayout>
  )
}
