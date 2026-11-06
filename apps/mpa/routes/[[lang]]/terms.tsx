// deno-lint-ignore-file ui-text/no-literal
// This page is English at every language's address: a translated contract could say something the
// English does not, so it is not translated. The frame around it is.
import { Fragment } from "preact"
import { TldrBox } from "@spy4x/preact-ui/tldr-box"
import { LegalPage, REPOSITORY_URL } from "../../site.tsx"
import { define } from "../../utils.ts"

// Keep the ids stable, so the checkout and the pricing page can link to one section once they
// do. Reword a label, never rename an id.
const TERMS_SECTIONS = [
  { label: `What Financy is`, href: `#what` },
  { label: `Price and payment`, href: `#price` },
  { label: `Renewal and cancelling`, href: `#renewal` },
  { label: `Money-back guarantee and refunds`, href: `#refunds` },
  { label: `When you stop paying`, href: `#stop-paying` },
  { label: `Converted totals are estimates`, href: `#estimates` },
  { label: `Your household`, href: `#household` },
  { label: `Your data`, href: `#data` },
  { label: `What is not allowed`, href: `#not-allowed` },
  { label: `Availability and liability`, href: `#availability` },
  { label: `Self-hosting and the AGPL-3.0 licence`, href: `#code` },
  { label: `Law and courts`, href: `#law` },
  { label: `Changes and questions`, href: `#changes` },
] as const

/** The terms page's title, summary and the date its text last changed. */
export const TERMS_HEAD = {
  title: `Terms: price, renewal and refunds`,
  description: `What Financy's cloud costs, how renewal, cancelling and the 30-day money-back ` +
    `guarantee work, and what Financy is not: financial advice.`,
  updated: `2026-11-06`,
} as const

/** The "In short" points, each with the section that proves it. */
const SUMMARY = [
  [`Financy's cloud costs $4 a month or $40 a year per household, for up to 6 members.`, `#price`],
  [
    `A plan renews until you cancel, and Stripe e-mails you before each yearly renewal.`,
    `#renewal`,
  ],
  [`You get your money back if you ask within 30 days of your first payment.`, `#refunds`],
  [`If you stop paying, you keep read access to your data and its export.`, `#stop-paying`],
  [
    `Financy keeps records; it gives no financial advice, and converted totals are estimates.`,
    `#what`,
  ],
] as const

/** A link in the summary, which sits outside the article that styles links. */
const LINK = `text-primary underline`

/** The terms of Financy's paid cloud: price, renewal, refunds and the rules. */
export default define.page(function Terms({ state }) {
  return (
    <LegalPage
      state={state}
      path="/terms"
      title="Terms"
      headTitle={TERMS_HEAD.title}
      description={TERMS_HEAD.description}
      updated="6 November 2026"
      sections={TERMS_SECTIONS}
      lead={
        <TldrBox
          title="In short"
          items={SUMMARY.map(([text, href]) => (
            <Fragment key={href}>
              {text}{" "}
              <a href={href} class={LINK}>
                {TERMS_SECTIONS.find((section) => section.href === href)!.label}
              </a>
            </Fragment>
          ))}
        />
      }
    >
      <h2 id="what">What Financy is</h2>
      <p>
        Financy is a tool for keeping records of a household's money: accounts, transactions,
        budgets and balances. It does not give financial, tax or investment advice, and nothing it
        shows is a recommendation to buy, sell or spend. Decisions about your money are yours.
      </p>
      <p>
        These terms are an agreement between you and NeatSoft PTE LTD, my company in Singapore,
        which runs Financy's cloud. I'm Anton Shubin, and "I" on this page means NeatSoft.
      </p>

      <h2 id="price">Price and payment</h2>
      <p>
        Financy's cloud costs $4 a month or $40 a year, in US dollars, per household of up to 6
        members. Inviting a member never costs more. Where the law requires it, VAT or sales tax is
        added at checkout, and you see the total before you pay.
      </p>
      <p>
        You pay from sign-up. There is no free trial: the public demo shows Financy with sample data
        and no account, and the money-back guarantee below covers the rest. Stripe takes the
        payment; Financy never sees your card.
      </p>
      <p>
        If the price changes, I e-mail you at least 30 days before, and the new price applies from
        your next renewal after that. You can cancel before it does.
      </p>

      <h2 id="renewal">Renewal and cancelling</h2>
      <p>
        $40 today, then $40 every year until you cancel. A yearly plan renews automatically on the
        day you first paid, every year, and Stripe e-mails you before each renewal.
      </p>
      <p>
        $4 today, then $4 every month until you cancel. A monthly plan renews the same way each
        month.
      </p>
      <p>
        You can cancel at any time on the billing page of the app. The plan then runs to the end of
        the period you paid for and does not renew.
      </p>
      <p>
        If you are a consumer in Germany, once the first year is over you can cancel a yearly plan
        at any time with one month's notice, and I refund the part of the year after the
        cancellation takes effect.
      </p>

      <h2 id="refunds">Money-back guarantee and refunds</h2>
      <p>
        If you ask within 30 days of your first payment, I refund it in full, no questions asked.
        The guarantee covers a household's first payment, monthly or yearly.
      </p>
      <p>
        Forgot to cancel before a renewal? If you have not used Financy since the renewal, ask
        within 14 days of the charge and I refund it in full and cancel the plan. If you have used
        it, ask within 5 days.
      </p>
      <p>
        Your rights under the consumer law of the country you live in come on top of these, and
        these terms never take them away.
      </p>

      <h2 id="stop-paying">When you stop paying</h2>
      <p>
        If you cancel or a payment fails, your household keeps its data. You can still read it all
        and export it, but not add or change anything, until you pay again or the owner deletes the
        household.
      </p>

      <h2 id="estimates">Converted totals are estimates</h2>
      <p>
        A total in your base currency is an estimate, made at a published reference rate for the
        date shown next to it. It can differ from what your bank charged. Each transaction keeps its
        original amount and currency, and a later rate never changes them.
      </p>

      <h2 id="household">Your household</h2>
      <p>
        The person who creates a household owns it and pays for it. The owner chooses who joins and
        what each member may change, and is responsible for inviting only people who agree to share
        the household's finances.
      </p>

      <h2 id="data">Your data</h2>
      <p>
        What you put in Financy stays yours: you can export it or delete it at any time. The{" "}
        <a href="/privacy">privacy page</a> says what is stored, who can see it and for how long.
      </p>

      <h2 id="not-allowed">What is not allowed</h2>
      <ul>
        <li>Breaking the law, or storing content that does.</li>
        <li>Sending spam, for example through invitations.</li>
        <li>Attacking the service or other people's accounts.</li>
        <li>Putting other people's financial data in Financy without their permission.</li>
      </ul>
      <p>
        I may suspend accounts that break these rules. Unless the law or an ongoing attack stops me,
        I tell you first and give you a chance to export your data.
      </p>

      <h2 id="availability">Availability and liability</h2>
      <p>
        I work to keep Financy running and your data backed up, but there is no promise that it is
        always up. Keep your own export of anything you cannot afford to lose.
      </p>
      <p>
        As far as the law allows, my liability to you is limited to what you paid for Financy in the
        12 months before the claim. Nothing here limits liability that the law does not let me
        limit.
      </p>

      <h2 id="code">Self-hosting and the AGPL-3.0 licence</h2>
      <p>
        Financy's source is on <a href={REPOSITORY_URL}>GitHub</a>{" "}
        under the AGPL-3.0 licence. You may run it on your own server for free; that licence, not
        this page, governs what you may do with the code, and these terms apply only to the cloud.
      </p>

      <h2 id="law">Law and courts</h2>
      <p>
        These terms follow the law of Singapore, and disputes about them go to the courts of
        Singapore. If you are a consumer, you also keep the protection of the law of the country you
        live in, and you may take a dispute to its courts.
      </p>

      <h2 id="changes">Changes and questions</h2>
      <ul>
        <li>6 November 2026: the first version, for Financy's cloud.</li>
      </ul>
      <p>
        When these terms change, the new text appears here with its date, and a paying household
        gets an e-mail before a change that affects it takes effect. The full history is{" "}
        <a href={`${REPOSITORY_URL}/commits/main/apps/mpa/routes/%5B%5Blang%5D%5D/terms.tsx`}>
          on GitHub
        </a>. Questions and refund requests go to me at{" "}
        <a href="mailto:hi@financy.dev">hi@financy.dev</a>.
      </p>
    </LegalPage>
  )
})
