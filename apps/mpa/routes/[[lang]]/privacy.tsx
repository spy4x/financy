// deno-lint-ignore-file ui-text/no-literal
// This page is English at every language's address: a translated policy could say something the
// English does not, so it is not translated (#276). The frame around it is.
import { Fragment } from "preact"
import { TldrBox } from "@spy4x/preact-ui/tldr-box"
import { AUTHOR_URL, LegalPage, REPOSITORY_URL } from "../../site.tsx"
import { define } from "../../utils.ts"

// Keep the ids stable, so the app, the checkout and support can link to one section once they
// do. Reword a label, never rename an id.
const PRIVACY_SECTIONS = [
  { label: `Who runs Financy and where`, href: `#who` },
  { label: `What Financy stores`, href: `#stores` },
  { label: `Who can see your data`, href: `#who-sees` },
  { label: `Companies that handle it`, href: `#processors` },
  { label: `Reading statements with AI`, href: `#ai` },
  { label: `How it is protected`, href: `#protection` },
  { label: `How long it is kept`, href: `#retention` },
  { label: `Your copy, corrections and deletion`, href: `#rights` },
  { label: `Cookies and your browser`, href: `#cookies` },
  { label: `Self-hosting and the demo`, href: `#self-hosted` },
  { label: `This website and its statistics`, href: `#website` },
  { label: `Changes and questions`, href: `#changes` },
] as const

/** The privacy page's title, summary and the date its text last changed. */
export const PRIVACY_HEAD = {
  title: `Privacy: what is kept about your household`,
  description: `What Financy's cloud stores about your household's money, who sees it, which ` +
    `companies handle it, how long it stays and how to delete it.`,
  updated: `2026-11-04`,
} as const

/** A group's heading inside a section: `LegalPage` styles `h2` only. */
const GROUP = `mt-2 font-semibold`

/** The "In short" points, each with the section that proves it. */
const SUMMARY = [
  [`NeatSoft PTE LTD, my company in Singapore, runs Financy's cloud.`, `#who`],
  [`Only the members of your household see its accounts, transactions and budgets.`, `#who-sees`],
  [
    `Nothing is sold, there are no ads, and reading statements with AI stays off until you turn it on.`,
    `#processors`,
  ],
  [
    `Your data is encrypted on its way to Financy, on disk and in backups. It is not end-to-end encrypted.`,
    `#protection`,
  ],
  [
    `You can download or delete your data at any time; a deleted household can be restored for 30 days and is gone from the backups about seven months after you delete it.`,
    `#retention`,
  ],
] as const

/** A link in the summary, which sits outside the article that styles links. */
const LINK = `text-primary underline`

/** What Financy's cloud, its website and its demo keep about a household, and why. */
export default define.page(function Privacy({ state }) {
  const app = new URL(state.spaOrigin).host
  return (
    <LegalPage
      state={state}
      path="/privacy"
      title="Privacy"
      headTitle={PRIVACY_HEAD.title}
      description={PRIVACY_HEAD.description}
      updated="4 November 2026"
      sections={PRIVACY_SECTIONS}
      lead={
        <TldrBox
          title="In short"
          items={SUMMARY.map(([text, href]) => (
            <Fragment key={href}>
              {text}{" "}
              <a href={href} class={LINK}>
                {PRIVACY_SECTIONS.find((section) => section.href === href)!.label}
              </a>
            </Fragment>
          ))}
        />
      }
    >
      <h2 id="who">Who runs Financy and where</h2>
      <p>
        I'm Anton Shubin. My company, NeatSoft PTE LTD in Singapore, runs Financy's cloud at{" "}
        <a href={state.spaOrigin}>{app}</a>{" "}
        and decides what happens to the data in it: in the words of data protection law, it is the
        controller. This page says what the cloud keeps about you and your household, and why.
      </p>
      <p>
        Your household's data is stored on servers in{" "}
        <mark>[OWNER: where the cloud runs on launch day]</mark>.
      </p>

      <h2 id="stores">What Financy stores</h2>
      <h3 class={GROUP}>Your account</h3>
      <ul>
        <li>
          How you sign in: your email address, the password as a salted hash only (never the
          password itself), your passkeys, the second-factor secret if you turn it on, and the
          Google or GitHub account you linked, if you sign in with one.
        </li>
        <li>
          API tokens, if you create any: the name, the household, what the token may do, when it
          expires and when it was last used. The token itself is kept only as a keyed hash.
        </li>
        <li>Your name and profile picture, if you add them.</li>
        <li>
          A record of each sign-in, with the time, your IP address and your browser's user agent,
          and a record of changes with the time, so problems and break-ins can be traced.
        </li>
        <li>
          Each device you are signed in on: a name taken from your browser's user agent, your IP
          address with its last part hidden, and when it was last used.
        </li>
        <li>
          Your preferences: the theme, the region format, the time zone and the clock, and your
          notifications inside the app. A read notification is deleted 90 days later. The time zone
          and language of the first device you signed in on are kept too.
        </li>
        <li>Your browser's push address, only if you allow notifications.</li>
      </ul>
      <h3 class={GROUP}>Your household</h3>
      <ul>
        <li>Its name and base currency, who is in it, each member's role, and its invitations.</li>
        <li>An activity log: who changed what in the household and when, kept for a year.</li>
      </ul>
      <h3 class={GROUP}>Your finances</h3>
      <ul>
        <li>
          Accounts and their balances, crypto holdings among them, and every transaction and
          transfer: the amount, the currency, the date, the category, the note, and the converted
          amount next to the original.
        </li>
        <li>Categories, monthly budgets and recurring transactions.</li>
      </ul>
      <h3 class={GROUP}>Imports</h3>
      <ul>
        <li>
          A bank statement you upload, until its import is saved or abandoned. Then the file is
          deleted and only the transactions you saved stay.
        </li>
      </ul>
      <h3 class={GROUP}>Connections</h3>
      <ul>
        <li>
          If you link the Telegram bot: your Telegram account's id and the messages the bot sends
          you, so it can add transactions and answer with balances.
        </li>
      </ul>
      <h3 class={GROUP}>Payments</h3>
      <ul>
        <li>
          Stripe takes the payment. Financy keeps only Stripe's customer and subscription numbers,
          never your card.
        </li>
      </ul>

      <h2 id="who-sees">Who can see your data</h2>
      <p>
        Everyone in your household sees its accounts, transactions, categories and budgets. What
        each member may change depends on their role, which the household's owner sets. Members see
        each other's name, profile picture and role; the owner and admins also see each member's
        email address and when they were last active.
      </p>
      <p>
        To run the service and answer support, the operators can see in the admin panel each
        account's details, its sign-in records with IP addresses, its devices, notifications and API
        tokens, and each household's members, plan and overview. They can also open and download a
        household's uploaded files, and each time they open one, it is recorded. Nobody at NeatSoft
        looks at a household's accounts or transactions, except when the household asks for help
        with a problem, or when the law requires it.
      </p>

      <h2 id="processors">Companies that handle it</h2>
      <p>
        Financy does not sell your data and shows no ads. Outside Financy, your data goes only to
        these companies, each for one job.
      </p>
      <h3 class={GROUP}>Always</h3>
      <ul>
        <li>
          <strong>The hosting provider</strong> named under{" "}
          <a href="#who">Who runs Financy and where</a>: runs the servers and keeps the backups. It
          holds everything, encrypted on disk.
        </li>
        <li>
          <strong>Stripe</strong>{" "}
          (United States): takes payments. It receives your email address and card, never your
          finances.
        </li>
        <li>
          <strong>The mail provider</strong>: delivers sign-in codes, invitations, reminders and the
          newsletter. It receives your email address and the message, never your finances.
        </li>
        <li>
          <strong>Exchange-rate sources</strong>: Frankfurter, which publishes the European Central
          Bank's rates, and a rate provider for the currencies the bank does not cover. They receive
          currency codes and dates, never amounts.
        </li>
        {state.analytics && (
          <li>
            <strong>Umami</strong>, on my own server: counts visits to this website, not to the app.
            See <a href="#website">This website and its statistics</a>.
          </li>
        )}
      </ul>
      <h3 class={GROUP}>Only when you turn it on</h3>
      <ul>
        <li>
          <strong>OpenAI, DeepSeek or Google Gemini</strong>, the one your household picks: reads a
          masked sample of a bank statement Financy does not recognise. See{" "}
          <a href="#ai">Reading statements with AI</a>.
        </li>
        <li>
          <strong>Google or GitHub</strong>: confirms who you are, if you sign in with them. They
          learn that you signed in to Financy, never your finances.
        </li>
        <li>
          <strong>Your browser's push service</strong>{" "}
          (Google, Mozilla or Apple, by browser): delivers notifications, if you allow them. It
          receives your push address and the message, encrypted.
        </li>
        <li>
          <strong>Telegram</strong>: carries your messages with the Financy bot, if you link it.
        </li>
      </ul>

      <h2 id="ai">Reading statements with AI</h2>
      <p>
        Financy reads most bank statements on its own. For a layout it has not seen, it can ask an
        AI model which column holds the date, the amount and the description. This is off until your
        household turns it on, and your household picks the provider: OpenAI (United States),
        DeepSeek (China) or Google Gemini (United States).
      </p>
      <p>
        The provider receives a masked sample of the statement, never the file. Every letter and
        digit outside the header row is replaced, so it sees the shape of the rows (where columns
        start, which hold numbers) but no names, amounts, dates or account numbers. Turning the
        setting off stops it at once.
      </p>
      <p>
        On your own server, you can point Financy at Ollama instead, so the sample never leaves your
        machine.
      </p>

      <h2 id="protection">How it is protected</h2>
      <p>
        Your data is encrypted on its way between your device and Financy (HTTPS), on the server's
        disk, and in the backups. Passwords are kept only as salted hashes.
      </p>
      <p>
        It is not end-to-end encrypted: the server can read your data, because it adds up balances,
        converts currencies and reads statements for you. That is why the previous section lists
        exactly who else can.
      </p>

      <h2 id="retention">How long it is kept</h2>
      <ul>
        <li>
          A household you delete, and anything else the app lets you restore, stays restorable for
          30 days and is then removed for good.
        </li>
        <li>
          A deleted account is hidden at once and deleted for good 7 days later; signing in during
          those 7 days brings it back.
        </li>
        <li>
          Backups are kept for six months, so data you deleted is gone from them about seven months
          after the delete: 30 days to restore, then six months of backups.
        </li>
        <li>
          A household's activity log is kept for a year, and outlives a deleted household.
        </li>
        <li>
          A household that stops paying keeps its data, read access and its export, until its owner
          deletes it.
        </li>
        <li>A data download is deleted 7 days after it was made.</li>
      </ul>

      <h2 id="rights">Your copy, corrections and deletion</h2>
      <p>
        To get a copy of your data, choose Download my data in your profile. The app prepares a ZIP
        of JSON and CSV files with your account, settings and sign-in methods, and tells you by
        e-mail and in the app when it is ready. You can ask for one a day. The household's owner can
        also export all of the household's finances as CSV.
      </p>
      <p>
        You can correct anything you entered in the app itself. You can delete your account from
        your profile; it asks for your password, and for your authenticator code if you turned that
        on. A household you own that other people still use, or a paid plan that is not cancelled,
        stops the deletion until you hand the household over or cancel the plan.
      </p>
      <p>
        Deleting the account removes the households you own with everything in them, your sessions,
        your profile and settings. What you entered in a household someone else owns stays there,
        shown as entered by "Deleted user".
      </p>

      <h2 id="cookies">Cookies and your browser</h2>
      <p>
        While you are signed in, the app keeps two cookies. Signing out removes them; otherwise they
        last two months, counted again from each day you use the app.
      </p>
      <ul>
        <li>A signed session cookie that scripts cannot read. It keeps you signed in.</li>
        <li>
          <code>user_id</code>, which holds your account number and which the app's scripts can
          read, so the app knows who is signed in before it asks the server.
        </li>
      </ul>
      <p>
        While you sign in or sign up, short-lived cookies hold the step you are on: the code sent to
        you, or the Google or GitHub sign-in in progress with the name, address and picture that
        account shared. Each expires when its step's time runs out.
      </p>
      <p>
        There are no advertising or tracking cookies. So that the app opens without a network, it
        keeps a copy of your household's data in your browser's own storage, with who is signed in
        and the household you last chose.
      </p>

      <h2 id="self-hosted">Self-hosting and the demo</h2>
      <p>
        If you run Financy on your own server, your data stays there and nothing reaches NeatSoft:
        you are its controller, and this page does not apply to it.
      </p>
      <p>
        The public demo holds sample data only, needs no account, and is reset every night. Do not
        enter real finances there.
      </p>

      <h2 id="website">This website and its statistics</h2>
      <p>
        {new URL(state.webAppOrigin).host}{" "}
        sets no cookies. The server keeps request logs, with your IP address, to run and fix the
        site. If you subscribe to the newsletter, it keeps your email address and when you confirmed
        it; the unsubscribe link in any of its mails removes it. A blog post's pictures may load
        from another site, which then sees your IP address, as any site you visit does.
      </p>
      {state.analytics
        ? (
          <>
            <p>
              This website counts visits with Umami, which I host myself, so the numbers reach no
              other company. It sets no cookies and stores nothing that names you: no IP address, no
              email address, and nothing that follows you to other sites.
            </p>
            <p>
              For each page it records the address of the page, the site you came from, your
              browser, operating system, device type, screen size and language, your country, region
              and city, worked out from your IP address, and how fast the page loaded. It also
              counts clicks on the main buttons and links, newsletter sign-ups and plans chosen on
              the pricing page.
            </p>
            <p>
              If your browser sends Do Not Track, nothing is counted. Known bots are not counted.
              The app counts nothing.
            </p>
          </>
        )
        : <p>This website keeps no visitor statistics, and neither does the app.</p>}

      <h2 id="changes">Changes and questions</h2>
      <ul>
        <li>4 November 2026: the first version, for Financy's cloud.</li>
      </ul>
      <p>
        When this page changes, the new text appears here with its date, and the full history is
        {" "}
        <a href={`${REPOSITORY_URL}/commits/main/apps/mpa/routes/%5B%5Blang%5D%5D/privacy.tsx`}>
          on GitHub
        </a>. Questions, and requests for a copy or deletion, go to me through{" "}
        <a href={AUTHOR_URL}>antonshubin.com</a>.
      </p>
    </LegalPage>
  )
})
