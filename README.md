# Treat Jar

A themed reward jar for kids. Give a treat, drop a token in the jar, watch it
pile up. Fill the jar and it celebrates, empties, and starts again.

- **Four themes** — dinosaurs, money, space and sweets, each with four token shapes.
- **Real physics** — tokens tumble and settle into a proper pile. You can shake it.
- **Two kinds of target** — count the tokens, or save up to a cash amount.
- **Change your mind about the theme** — switch a jar that already has treats in
  it and you decide what they are worth in the new one, or start the jar again.
- **One-tap reasons** — "Tidied room" drops the right token in, or pick one by hand.
- **Take one back** — as a mistake or as a consequence, with the reason kept in history.
- **Share a snapshot** — a link anyone can open, no account needed.
- **Optional Google Drive sync** — the same jars on your phone and your tablet.

Works offline and installs to a home screen.

## Development

```sh
npm install
npm run dev      # http://localhost:5173/TreatJar/
npm test
npm run check    # typecheck; CI treats warnings as errors
```

`npm run build && npm run preview` is the only way to exercise the service worker.

## Deploying

Pushing to `main` builds and deploys to GitHub Pages. Two one-off steps:

1. The repo must be named **`TreatJar`** — `base` in `vite.config.ts` is
   `/TreatJar/` and the site is served from `https://<user>.github.io/TreatJar/`.
2. Settings → Pages → Source: **GitHub Actions**.

## Enabling Google Drive sync (optional)

The app is fully usable without this. Jars are stored in Drive's private
`appDataFolder`: hidden from the user's Drive, unreadable by any other app, and
— being private — not what share links use.

1. [Google Cloud Console](https://console.cloud.google.com/) → new project.
2. Enable the **Google Drive API**.
3. OAuth consent screen → **External**. Add yourself under *Test users*, or publish.
4. Credentials → **Create OAuth client ID** → **Web application**.
   Authorised **JavaScript origins**:
   - `http://localhost:5173`
   - `https://<your-user>.github.io`

   Leave redirect URIs empty — the Google Identity Services token flow does not
   use them.
5. Put the client id in `.env`:

   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
   ```

   For the deployed site, add the same value as a repository variable or secret
   and pass it to the build step in `.github/workflows/deploy.yml`.

The client id is a public identifier, not a secret. What actually restricts it
is the list of authorised origins above.

## Share links

"Share" encodes the jar's current state into the URL itself — name, theme,
target and the tokens in the pile, at roughly 150 bytes. Whoever opens it sees
a read-only snapshot with no sign-in.

It is a snapshot, not a live view: share again to show a newer one. Reasons,
notes, history and every other jar stay on your device.

## Notes for contributors

`AGENTS.md` has the architecture, the rules that bite, and the verification
caveats. Read it before changing the physics or the sync merge.
