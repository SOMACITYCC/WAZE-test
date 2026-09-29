WAZE - SOMA CITY CHURCH: SETUP GUIDE

WHAT'S IN THIS FOLDER
- waze/index.html ................ the assessment page (your link will be yoursite.com/waze)
- netlify/functions/submit.mjs ... sends each result to Planning Center
- netlify.toml ................... tells Netlify where things are (no changes needed)

WHAT IS NETLIFY?
Netlify is a free hosting service. It puts the page on the internet and runs the small
program that saves results to Planning Center. Your Planning Center key is stored there
privately, so it is never exposed on the page.

STEP 1: PUT THE FILES ON GITHUB (free)
1. Make a free account at github.com and create a new repository (name it "waze").
2. Unzip this package on your computer.
3. In the new repository, click "Add file" > "Upload files". Drag in everything from the
   unzipped folder (waze, netlify, netlify.toml, README.txt) and click "Commit changes".

STEP 2: CONNECT NETLIFY
1. Make a free account at netlify.com (you can sign in with GitHub).
2. Click "Add new project" > "Import an existing project" > GitHub > choose "waze".
3. Leave the build command blank and click Deploy. Note: "Deploy manually" (drag and drop)
   will NOT work, because it does not run the Planning Center function.

STEP 3: ADD YOUR SETTINGS
In Netlify go to Project configuration > Environment variables and add:
- PCO_APP_ID and PCO_SECRET: a Personal Access Token from
  https://api.planningcenteronline.com/oauth/applications (a Planning Center admin creates it)
- ALLOWED_ORIGIN: your site's address with no slash at the end,
  for example https://your-site.netlify.app
Optional:
- RESEND_API_KEY and EMAIL_FROM: sends the person a short results summary by email
- PCO_PROMOTE = true: moves the card to the next workflow step (add a second step first)
Then go to Deploys > Trigger deploy > Deploy project so the settings take effect.

STEP 4: TEST
Open yoursite.netlify.app/waze, take the assessment with a test email, and check that a
card appears in the "WAZE test" workflow with the results in its notes.
If nothing appears, Netlify > Logs > Functions shows what went wrong.
