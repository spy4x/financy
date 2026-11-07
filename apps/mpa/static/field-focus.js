// Puts the cursor in a form's field when the visitor arrives at the form's section by its address:
// "Get notified" leads to `#newsletter`, and the email field takes focus, ready to type. The script
// tag names both: `data-hash` the section's id and `data-field` the field's. The browser has
// scrolled to the section already; focusing without scrolling keeps the section's heading in view.
// Without JavaScript the link still scrolls to the form.
;(() => {
  const { hash, field } = document.currentScript?.dataset ?? {}
  const focus = () => {
    if (location.hash !== `#${hash}`) return
    document.getElementById(field ?? "")?.focus({ preventScroll: true })
  }
  // A link to the section on this page. Checked after the click's own navigation, which fires no
  // `hashchange` when the address already ends in the section's id.
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (link && new URL(link.href).hash === `#${hash}`) setTimeout(focus)
  })
  // Arriving from another page with the section's id in the address. The browser moves focus itself
  // when it scrolls to the section, which it may do until the page has loaded: so focus after that.
  addEventListener("load", () => setTimeout(focus))
})()
