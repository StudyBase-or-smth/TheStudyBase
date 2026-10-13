StudyBase is a static website. Its API/sync backend is maintained separately in Backend-server-program.

Run npm run build to generate sync-config.generated.js in this folder. The generator has no dependencies. It reads BASECOMPUTER_SYNC_URL and PROGRAM_SYNC_URL from the build environment, with independent defaults of http://127.0.0.1:8787/sync. The generated file is ignored by Git. These are public backend URLs; never include credentials in them.

Coolify settings:

- Build strategy: Nixpacks; site type: Static.
- Base directory: /.
- Install command: npm install --package-lock=false.
- Build command: npm run build.
- Publish directory: /.
- Exposed port: 80; no Node start command.

Set BASECOMPUTER_SYNC_URL to the backend's full HTTPS /sync URL and PROGRAM_SYNC_URL to your local backend URL. Make both available during build. Remote pages use BASECOMPUTER_SYNC_URL; local/file pages use PROGRAM_SYNC_URL. The backend's STUDYBASE_ALLOWED_ORIGINS must include the frontend origin.

Pages and assets are served directly from this folder; there is no dist directory or copying build. Push source changes and redeploy to update the hosted website. For local edits, run the config generator once, serve this folder with a static web server, and refresh the page.
