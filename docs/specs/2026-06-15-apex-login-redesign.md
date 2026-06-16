# Apex Login Redesign and Design System Foundation

## Goal

Redesign the sign-in screen as the first surface of a clean-room visual
overhaul of the whole app. The login establishes a new design language (the
"Apex" system): a warm, literary "storybook" identity that replaces the current
GitHub-dark coral/purple look entirely. Nothing of the previous design carries
forward. Login is the proving ground; the same tokens and primitives defined
here will be reused as each later surface (dashboard, book reader, generation
flow) is redesigned in its own pass.

## Context (current state)

`apex/` is a React 18 + Vite single-page app. When logged out, `App.tsx`
renders `components/auth/SignIn.tsx`; when logged in it renders the dashboard
and reader. Authentication lives in `contexts/AuthContext.tsx` and exposes
exactly two methods we will keep unchanged:

- `signInWithEmail(email)`: Supabase magic-link OTP, redirects to
  `window.location.origin`.
- `signInWithGoogle()`: Supabase Google OAuth redirect.

The current `SignIn.tsx` is a placeholder: a centered column with an email
input, a "Send magic link" button, an "or" divider, and "Continue with Google".
Its `SignIn.css` uses hardcoded indigo (`#4f46e5`) that does not even match the
app tokens. Global tokens live in `src/index.css` under `:root` (coral
`--accent-color`, purple `--vs-color`, dark `--bg-color`, the `Outfit` font).
`Dashboard` and `BookViewer` reference those tokens by name.

The product itself is "Who Would Win?" style illustrated storybooks: a user
names two things and the app generates an illustrated showdown. The versus idea
is the soul of the product, so the new identity keeps it, expressed quietly as
an ampersand ("this & that") rather than a loud "VS".

## Scope

### In scope

- Define the **Apex design system** as CSS custom properties: palette, type,
  spacing, atmosphere, motion, and a small set of reusable primitives.
- Rebuild the **login screen** to the locked design (Daylight Paper base,
  Forest Green accent, Centered Title Page layout), including all interaction
  states.
- Add the three new web fonts and update the document title.
- Tests for the rebuilt `SignIn` component.

### Out of scope (own later passes, same tokens)

- Redesigning the dashboard, book reader, generation overlay, and post-login
  chrome (the inline "Sign out" button).
- The two-accent "one color per combatant" system (anchor on a single primary
  for now).
- Layout 2 ("The Open Book" spread) and any real rotating featured matchup.
- Any change to auth behavior, routing, or backend.

### Non-breaking migration note

The new Apex tokens are **added alongside** the existing tokens in `index.css`,
not swapped in. The redesigned login uses only Apex tokens; the not-yet-touched
dashboard and reader keep using the old tokens until their own passes, at which
point the old tokens are deleted surface by surface. Login and the dashboard
never render at the same time, so there is no visual clash during migration.

## The Apex design system

### Palette (CSS variables)

Every token is prefixed `--apex-` so the new system can be added next to the
legacy tokens without collision (notably the legacy `--radius: 12px` the
dashboard depends on) and so the new system reads as one named layer.

```
--apex-paper-hi:     #FBF5E6   /* lightest ivory, top of page gradient   */
--apex-paper:        #F2E7CE   /* mid ivory                               */
--apex-paper-lo:     #ECDFC0   /* deepest ivory, bottom of gradient       */
--apex-surface:      #FDFAF1   /* inputs and ghost-button fill            */
--apex-ink:          #2A2018   /* primary text                            */
--apex-ink-soft:     #4A3D29   /* ghost-button label                      */
--apex-brown:        #6E5E44   /* subtitle / secondary text               */
--apex-brown-mute:   #9A8462   /* footer / tertiary text                  */
--apex-forest:       #3E6B4A   /* primary accent (buttons, links, mark)   */
--apex-forest-deep:  #335A3E   /* primary hover / active                  */
--apex-on-forest:    #FBF5E6   /* text on forest fills                    */
--apex-gilt:         #C7A23E   /* emblem ring, hairline flourishes        */
--apex-rule:         #D8C49A   /* dividers, frame inner line              */
--apex-field-border: #DCC99E   /* input and ghost-button border           */
--apex-error:        #A23B2A   /* inline error text (a clay brick red)    */
--apex-focus:        rgba(62, 107, 74, 0.35)  /* forest focus ring        */
```

The page background is a radial gradient:
`radial-gradient(120% 90% at 50% -20%, var(--apex-paper-hi), var(--apex-paper) 70%, var(--apex-paper-lo))`,
overlaid with a faint two-layer dotted "paper grain" at low opacity.

### Type

```
--apex-font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
--apex-font-serif:   'Newsreader', Georgia, serif;      /* used italic   */
--apex-font-ui:      'Hanken Grotesk', system-ui, -apple-system, sans-serif;
```

- **Fraunces** (weights 400/600/900, optical sizing on): display only. The title
  and the gilt "&" emblem.
- **Newsreader** italic: literary asides only. The subtitle, the "or" divider,
  and the "Check your inbox" line.
- **Hanken Grotesk** (400/500/600/700): every form control, label, kicker, and
  footer. Keeps the interactive surface crisp and legible.

### Spacing, radius, motion

```
--apex-radius:       10px;   /* inputs and buttons          */
--apex-radius-frame: 6px;    /* the title-page double rule  */
--apex-ease:         cubic-bezier(0.22, 1, 0.36, 1);
```

On first paint the column reveals with a gentle staggered fade-and-rise
(emblem, kicker, title, subtitle, form, footer, roughly 60ms apart). The forest
primary button darkens to `--apex-forest-deep` and lifts 1px on hover. All motion is
wrapped in `@media (prefers-reduced-motion: no-preference)`; with reduced motion
requested, everything renders in final position with no transition.

### Reusable primitives (named for reuse across the app)

- **Paper field** (`.apex-field`): `--apex-surface` fill, `--apex-field-border`
  border, `--apex-radius`, forest focus ring via `--apex-focus`.
- **Primary stamp button** (`.apex-btn`): `--apex-forest` fill, `--apex-on-forest`
  text, bold Hanken Grotesk.
- **Ghost button** (`.apex-btn--ghost`): `--apex-surface` fill,
  `--apex-field-border` border, `--apex-ink-soft` text.
- **Emblem** (`.apex-emblem`): a circle with a gilt ring and an inset paper
  halo, holding the Fraunces "&".
- **Italic divider** (`.apex-divider`): a hairline rule each side of a Newsreader
  italic word.

## The login screen

### Layout

Centered single column, vertically and horizontally centered in the viewport,
inside a **gilt double-rule frame** (an outer `--apex-rule` border inset from the
edges, with a second finer line just inside it) that evokes a book's title page.
Max content width about 340px. The frame insets and the title size both reduce
on small screens.

### Anatomy and copy (top to bottom)

1. Emblem: the Fraunces "&".
2. Kicker (Hanken Grotesk, uppercase, letter-spaced): `An Apex Publication`
3. Title (Fraunces 900): `Who Would` then `Win?` where "Win?" is italic weight
   500 in `--apex-forest`.
4. Subtitle (Newsreader italic, `--apex-brown`): `Conjure an illustrated showdown
   between any two things, then find out who would win.`
5. Email field (paper field), placeholder `you@example.com`, with a
   visually-hidden `<label>` reading "Email address".
6. Primary button: `Send me a magic link`
7. Italic divider: `or`
8. Ghost button with an inline multicolor Google "G": `Continue with Google`
9. Footer (Hanken Grotesk, `--apex-brown-mute`): `No password. The same link signs
   you in or signs you up.`

All copy avoids em dashes.

### Interaction states

The component tracks `email` plus a `status` of `idle | sending | sent | error`
and an `errorMessage`.

- **idle**: the form as described above.
- **sending**: triggered on submit. The primary button is disabled and reads
  `Sending the link...`; the field is disabled.
- **sent**: the form is replaced by a confirmation panel: a forest seal/check
  mark, a Newsreader italic heading `Check your inbox`, body text `We sent a
  magic link to {email}. Open it on this device to step inside.`, and a quiet
  ghost link `Use a different email` that returns to `idle`.
- **error**: an inline message in `--apex-error` below the field. Invalid address:
  `That address does not look right.` Send failure (the awaited auth call
  throws): `Something went wrong sending your link. Please try again.` The form
  returns to `idle` inputs so the user can retry.

`signInWithGoogle` is a redirect; if it throws synchronously we surface the same
generic error. Submit is wrapped in `try/catch` (the current code is not), and
the email is validated before calling the API.

### Accessibility

- The input has an associated label, `type="email"`, `inputMode="email"`,
  `autoComplete="email"`, and `required`.
- Both buttons have clear accessible names; the Google glyph is decorative
  (`aria-hidden`).
- Visible `:focus-visible` ring in forest on all interactive elements.
- Confirm computed contrast of `--apex-on-forest` on `--apex-forest` meets WCAG
  AA (>= 4.5:1) for the button label; darken `--apex-forest` if it falls short.
  Ink on paper is comfortably above AA.
- Honors `prefers-reduced-motion`.

## Implementation

No Tailwind. The system is plain CSS plus the `:root` custom properties above,
matching the existing per-component CSS convention and keeping the build lean.

Files touched:

- **`apex/index.html`**: add a Google Fonts `<link>` for Fraunces, Newsreader,
  and Hanken Grotesk (the existing Outfit link stays until the dashboard pass).
  Update `<title>` from "Vite + React + TS" to `Who Would Win? - An Apex
  Publication`.
- **`apex/src/index.css`**: add the Apex `:root` token block and the shared
  primitive classes, alongside (not replacing) the existing tokens.
- **`apex/src/components/auth/SignIn.tsx`**: rewrite the markup and add the
  `status` / `errorMessage` state machine and validation, still calling
  `useAuth().signInWithEmail` / `signInWithGoogle`. Use `lucide-react` (already a
  dependency) for the check/mail icon; inline an SVG for the multicolor Google
  "G".
- **`apex/src/components/auth/SignIn.css`**: full rewrite to the Apex system
  (page gradient, grain, frame, primitives, entrance animation, responsive
  rules, reduced-motion).

## Testing

Add `apex/src/components/auth/SignIn.test.tsx` (vitest + Testing Library, the
existing stack) covering:

- Renders the title, kicker, both buttons, and the email field.
- Typing an email and submitting calls `signInWithEmail` with that address and
  shows the "Check your inbox" panel containing the address.
- "Use a different email" returns to the form.
- Clicking "Continue with Google" calls `signInWithGoogle`.
- A rejected `signInWithEmail` shows the inline error and leaves the form
  usable.
- An invalid email shows the validation error and does not call the API.

Verification: `npm --prefix apex run lint`, `build`, and `test:run` all pass,
plus a manual look at the running dev server (default, sending, sent, and error
states, desktop and narrow widths).

## Future surfaces (not built here)

The same tokens and primitives extend, in later passes, to: a "bookshelf"
dashboard, a composer for new matchups, a redesigned reader, the generation
progress experience, and post-login chrome. The two-accent per-combatant system
and the "Open Book" login spread remain options to revisit then.
