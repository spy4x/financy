/**
 * The SPA palette's command registry, ranked by the palette's own `matchOptions` as `SearchPalette`
 * ranks it: which commands a person finds by which words, which are offered when, and what a pick
 * asks the app to do.
 */
import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { matchOptions } from "@spy4x/preact-ui/command-palette"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import type { ThemePreference } from "@domain/identity"
import app from "@i18n/app/en.ts"
import appRu from "@i18n/app/ru.ts"
import {
  groupRow,
  paletteCommands,
  type PaletteContext,
  type PaletteOption,
  pickedChoice,
  quickCreateRows,
  type SearchChoice,
} from "./palette-commands.ts"

const EN = createTranslator({ language: `en`, catalogs: [{ source: app }] })
const RU = createTranslator({ language: `ru`, catalogs: [{ source: app, translation: appRu }] })
const HOME = { id: `0190a000-0000-7000-8000-000000000001`, name: `Home`, canWrite: true }

function context(overrides: Partial<PaletteContext> = {}): PaletteContext {
  return {
    t: EN,
    locale: `en`,
    currentGroup: HOME,
    online: true,
    theme: () => `system`,
    shortcuts: [],
    activityGroupId: null,
    pageCommands: [],
    guest: false,
    benchmark: false,
    canInstall: false,
    ...overrides,
  }
}

/** The label of the first command `query` finds. */
function top(query: string, overrides: Partial<PaletteContext> = {}): string | undefined {
  return matchOptions(paletteCommands(context(overrides), () => {}), query)[0]?.label
}

function labels(overrides: Partial<PaletteContext> = {}): string[] {
  return paletteCommands(context(overrides), () => {}).map((option) => option.label)
}

describe(`the palette's commands`, () => {
  it(`put Theme first for dark, тема, ntvf (тема on the English layout) and darkk`, () => {
    for (const query of [`dark`, `тема`, `ntvf`, `darkk`]) expect(top(query), query).toBe(`Theme`)
    expect(top(`dark`, { t: RU }), `dark in Russian`).toBe(`Тема`)
  })

  it(`put Go to Notes first for notse and заметки`, () => {
    for (const query of [`notse`, `заметки`]) {
      const found = matchOptions(paletteCommands(context(), () => {}), query)[0]
      expect([found?.label, found?.choice], query).toEqual([
        `Notes`,
        { kind: `page`, href: `/notes` },
      ])
    }
  })

  it(`offer one Settings command per profile section, each opening its page`, () => {
    const hrefs = paletteCommands(context(), () => {})
      .filter((option) => option.group === `Settings` && option.choice?.kind === `page`)
      .map((option) => (option.choice as { href: string }).href)
    for (
      const section of [
        `account`,
        `region`,
        `security`,
        `appearance`,
        `api-tokens`,
        `notifications`,
        `danger-zone`,
      ]
    ) expect(hrefs).toContain(`/profile/${section}`)
  })

  it(`find Theme and every profile section by settings and настройки`, () => {
    for (const query of [`settings`, `настройки`]) {
      const found = matchOptions(paletteCommands(context(), () => {}), query).map((option) =>
        option.id
      )
      expect(found, query).toContain(`action-theme`)
      for (const section of [`account`, `security`, `region`, `appearance`, `danger-zone`]) {
        expect(found, `${query} ${section}`).toContain(`action-settings-${section}`)
      }
    }
  })

  it(`offer no API tokens setting with the notes off, and every other section`, () => {
    const settings = (notes?: boolean) =>
      paletteCommands(context({ notes }), () => {})
        .filter((option) => option.group === `Settings` && option.choice?.kind === `page`)
        .map((option) => option.id)
    const on = settings()

    expect(on).toContain(`action-settings-api-tokens`)
    expect(settings(false)).toEqual(on.filter((id) => id !== `action-settings-api-tokens`))
  })

  it(`offer Activity only while the rail shows it, and opens that group's`, () => {
    expect(labels()).not.toContain(`Activity`)
    const activity = paletteCommands(context({ activityGroupId: HOME.id }), () => {})
      .find((option) => option.label === `Activity`)
    expect(activity?.choice).toEqual({ kind: `page`, href: `/groups/${HOME.id}/activity` })
  })

  it(`offer Install app only while the browser offers an install`, () => {
    expect(labels()).not.toContain(`Install app`)
    const install = paletteCommands(context({ canInstall: true }), () => {})
      .find((option) => option.label === `Install app`)
    expect(install?.choice).toEqual({ kind: `install` })
  })

  it(`offer New transaction and New category with the notes off, but not New note or New tag`, () => {
    const ids = (notes?: boolean) =>
      paletteCommands(context({ notes }), () => {}).map((option) => option.id)
    expect(ids()).toEqual(
      expect.arrayContaining([`action-new-note`, `action-new-tag`, `action-new-transaction`]),
    )
    expect(ids(false)).toEqual(
      expect.arrayContaining([`action-new-transaction`, `action-new-category`]),
    )
    expect(ids(false)).not.toContain(`action-new-note`)
    expect(ids(false)).not.toContain(`action-new-tag`)
  })

  it(`keep each command the server must run listed offline, dimmed with why, and dim none online`, () => {
    // A guest gets Keep your account; Turn off two-factor sign-in is listed only for a member.
    const dimmed = (online: boolean) =>
      [{ guest: true }, { twoFactor: true }].flatMap((extra) =>
        paletteCommands(context({ online, canInstall: true, benchmark: true, ...extra }), () => {})
          .filter((option) => option.disabledReason !== undefined)
          .map((option) => `${option.label}: ${option.disabledReason}`)
      )
    expect(new Set(dimmed(false))).toEqual(
      new Set([
        `Import notes`,
        `New group`,
        `Keep your account`,
        `Download my data`,
        `Change profile picture`,
        `Delete my account`,
        `Turn off two-factor sign-in`,
        `Sign out of all other devices`,
      ].map((label) => `${label}: Needs a connection`)),
    )
    expect(dimmed(true)).toEqual([])
  })

  it(`offer Import notes to an editor with the notes on, opening the notes picker`, () => {
    const importNotes = (overrides: Partial<PaletteContext> = {}) =>
      paletteCommands(context(overrides), () => {}).find((o) => o.label === `Import notes`)
    expect(importNotes()?.choice).toEqual({ kind: `page`, href: `/imports/new?kind=notes` })
    expect(top(`import csv`)).toBe(`Import notes`)
    expect(importNotes({ online: false })?.disabledReason).toBe(`Needs a connection`)
    expect(importNotes({ currentGroup: { ...HOME, canWrite: false } })).toBeUndefined()
    expect(importNotes({ notes: false })).toBeUndefined()
  })

  it(`ask the app to sign out through its own sign-out, never directly`, () => {
    const signOut = paletteCommands(context(), () => {})
      .find((option) => option.label === `Sign out`)
    expect([signOut?.choice, signOut?.run]).toEqual([{ kind: `sign-out` }, undefined])
  })

  it(`show each Theme row's state from the theme chosen now, and pick it with the palette open`, () => {
    let theme: ThemePreference = `system`
    const picked: SearchChoice[] = []
    const themeCommand = paletteCommands(
      context({ theme: () => theme }),
      (choice) => void picked.push(choice),
    ).find((option) => option.label === `Theme`)!
    const dark = themeCommand.children!.find((option) => option.label === `Dark`)!
    expect([themeCommand.state, dark.state, dark.keepOpen]).toEqual([`System`, undefined, true])

    dark.run!({ alternative: false })
    theme = `dark`

    expect(picked).toEqual([{ kind: `theme`, theme: `dark` }])
    expect([themeCommand.state, dark.state]).toEqual([`Dark`, `Current`])
  })
})

describe(`the finance commands`, () => {
  const OWNER = { ...HOME, canExport: true }
  /** The labels of every command `query` finds, ranked by the palette's own matcher. */
  const found = (query: string, overrides: Partial<PaletteContext> = {}) =>
    matchOptions(paletteCommands(context({ currentGroup: OWNER, ...overrides }), () => {}), query)
      .map((option) => option.label)
  const ids = (overrides: Partial<PaletteContext> = {}) =>
    paletteCommands(context(overrides), () => {}).map((option) => option.id)

  it(`offer New account, New transaction, New transfer and New category only in a writable group`, () => {
    const finance = [
      `action-new-account`,
      `action-new-transaction`,
      `action-new-transfer`,
      `action-new-category`,
    ]
    expect(ids()).toEqual(expect.arrayContaining(finance))
    for (const currentGroup of [{ ...HOME, canWrite: false }, null]) {
      for (const id of finance) expect(ids({ currentGroup }), id).not.toContain(id)
    }
  })

  it(`open the new account page from New account, in the current group`, () => {
    const newAccount = paletteCommands(context(), () => {})
      .find((option) => option.id === `action-new-account`)
    expect([newAccount?.label, newAccount?.detail, newAccount?.choice]).toEqual([
      `New account`,
      `In Home`,
      { kind: `page`, href: `/accounts/new` },
    ])
  })

  it(`find each Create command by the English and Russian words a person types`, () => {
    const words: Record<string, readonly string[]> = {
      "New account": [`add account`, `bank account`, `новый счёт`, `новый счет`, `создать счёт`],
      "New category": [`add category`, `create category`, `новая категория`, `создать категорию`],
      "New transaction": [
        `expense`,
        `трата`,
        `расход`,
        `доход`,
        `новая операция`,
        `добавить расход`,
        `добавить трату`,
        `платёж`,
        `возврат`,
      ],
      "New transfer": [`transfer money`, `перевод`, `перевести`, `перевод между счетами`],
    }
    for (const [label, queries] of Object.entries(words)) {
      for (const query of queries) expect(found(query), query).toContain(label)
    }
    for (const query of [`wallet`, `card`, `кошелёк`, `карта`]) {
      expect(found(query), query).toContain(`New account`)
    }
    expect(found(`снятие наличных`)).toContain(`New transfer`)
    expect(found(`новый счёт`, { t: RU })).toContain(`Новый счёт`)
  })

  it(`offer Export group to the current group's owner only, downloading that group`, () => {
    const exportOf = (overrides: Partial<PaletteContext> = {}) =>
      paletteCommands(context(overrides), () => {}).find((o) => o.id === `action-export-group`)
    const owned = exportOf({ currentGroup: OWNER })
    expect([owned?.label, owned?.detail, owned?.group, owned?.choice]).toEqual([
      `Export group`,
      `In Home`,
      `Settings`,
      { kind: `export-group`, groupId: HOME.id },
    ])
    expect(exportOf({ currentGroup: { ...OWNER, canExport: false } })).toBeUndefined()
    expect(exportOf({ currentGroup: HOME })).toBeUndefined()
    expect(exportOf({ currentGroup: null })).toBeUndefined()
  })

  it(`keep Export group listed offline, dimmed because it needs a connection`, () => {
    const exportOf = (online: boolean) =>
      paletteCommands(context({ currentGroup: OWNER, online }), () => {})
        .find((o) => o.id === `action-export-group`)
    expect(exportOf(false)?.disabledReason).toBe(`Needs a connection`)
    expect(exportOf(true)?.disabledReason).toBeUndefined()
  })

  it(`find Export group by export, download, backup and their Russian words`, () => {
    for (
      const query of [
        `export`,
        `download`,
        `backup`,
        `export household`,
        `экспорт`,
        `выгрузить`,
        `скачать`,
        `резервная копия`,
      ]
    ) expect(found(query), query).toContain(`Export group`)
    expect(found(`экспорт`, { t: RU })).toContain(`Экспортировать группу`)
  })
})

describe(`a group row`, () => {
  const row: PaletteOption = groupRow(EN, { id: HOME.id, name: `Acme Studio` }, `Owner`, false)

  it(`switches to the group on Enter and opens its settings on Ctrl Enter`, () => {
    expect(pickedChoice(row.choice!, false)).toEqual({ kind: `switch-group`, groupId: HOME.id })
    expect(pickedChoice(row.choice!, true)).toEqual({ kind: `group-settings`, groupId: HOME.id })
    expect(pickedChoice({ kind: `new-note` }, true)).toEqual({ kind: `new-note` })
  })

  it(`is found by "switch to" and its name`, () => {
    expect(matchOptions([row], `switch to acme`)).toEqual([row])
  })

  it(`is found by budget, household and their Russian words`, () => {
    for (const query of [`budget`, `household`, `бюджет`, `семья`, `домохозяйство`]) {
      expect(matchOptions([row], query), query).toEqual([row])
    }
  })
})

describe(`the quick-create rows`, () => {
  /** Each row's label, detail and why it cannot run, for `query` in `overrides`' state. */
  const rows = (query: string, overrides: Partial<PaletteContext> = {}) =>
    quickCreateRows(context(overrides), query).map((
      row,
    ) => [row.label, row.detail ?? null, row.disabledReason ?? null])
  const shown = (text: string) => `\u2068${text}\u2069`

  it(`offer a note, a tag and a group named after the trimmed query, under Create`, () => {
    const made = quickCreateRows(context(), `  groceries `)
    expect(rows(`  groceries `)).toEqual([
      [`New note: “${shown(`groceries`)}”`, `In Home`, null],
      [`New tag: “${shown(`groceries`)}”`, `In Home`, null],
      [`New group: “${shown(`groceries`)}”`, null, null],
    ])
    expect(made.map((row) => [row.group, row.choice])).toEqual([
      [`Create`, { kind: `quick-create`, entity: `note`, title: `groceries` }],
      [`Create`, { kind: `quick-create`, entity: `tag`, title: `groceries` }],
      [`Create`, { kind: `quick-create`, entity: `group`, title: `groceries` }],
    ])
  })

  it(`are not offered for an empty query or one of spaces only`, () => {
    expect([rows(``), rows(` \t `)]).toEqual([[], []])
  })

  it(`offer only the group without a current group, in a read-only group, and with the notes off`, () => {
    const groupOnly = [[`New group: “${shown(`milk`)}”`, null, null]]
    expect(rows(`milk`, { currentGroup: null })).toEqual(groupOnly)
    expect(rows(`milk`, { currentGroup: { ...HOME, canWrite: false } })).toEqual(groupOnly)
    expect(rows(`milk`, { notes: false })).toEqual(groupOnly)
  })

  it(`keep the group listed offline, dimmed with why it cannot run, and the note and tag as they are`, () => {
    expect(rows(`milk`, { online: false })).toEqual([
      [`New note: “${shown(`milk`)}”`, `In Home`, null],
      [`New tag: “${shown(`milk`)}”`, `In Home`, null],
      [`New group: “${shown(`milk`)}”`, null, `Needs a connection`],
    ])
  })

  it(`show at most forty characters of the text but hand back all of it`, () => {
    const long = `${`a`.repeat(39)}🛒🛒 tail`
    const [note] = quickCreateRows(context(), long)
    expect(note.label).toBe(`New note: “${shown(`${`a`.repeat(39)}🛒…`)}”`)
    expect(note.choice).toEqual({ kind: `quick-create`, entity: `note`, title: long })
  })

  it(`end a cut text at its last word, with no space before the "…"`, () => {
    const [note] = quickCreateRows(context(), `${`a`.repeat(34)} trip and more`)
    expect(note.label).toBe(`New note: “${shown(`${`a`.repeat(34)} trip…`)}”`)
  })

  it(`use the language's own quotes`, () => {
    expect(rows(`молоко`, { t: RU })[0][0]).toBe(`Новая заметка: «${shown(`молоко`)}»`)
  })

  it(`create at once on Ctrl Enter, and open the form on Enter`, () => {
    const choice: SearchChoice = { kind: `quick-create`, entity: `tag`, title: `milk` }
    expect(pickedChoice(choice, false)).toEqual(choice)
    expect(pickedChoice(choice, true)).toEqual({ ...choice, now: true })
  })
})
