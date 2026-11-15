Frontier Labs: website source
====================================

Open index.html in a browser and it works straight away. No build step and no installs.
To put it on your website, upload the whole folder (keep the css, js and data folders next to index.html).

Put it on GitHub Pages (free)
  1. Make a new repository on github.com (for example frontier-labs), set to Public.
  2. Click "Add file", then "Upload files", and drag in everything inside this folder: index.html,
     .nojekyll, 404.html, README.txt, server.py and the css, js and data folders. Click "Commit changes".
     (If the upload hides .nojekyll, that's fine. It only stops GitHub from processing the files.)
  3. Open Settings, then Pages. Under "Build and deployment" choose "Deploy from a branch", pick the
     main branch and the / (root) folder, and click Save.
  4. After a minute or two the site is live at https://YOUR-NAME.github.io/frontier-labs/
  GitHub Pages only serves files, so server.py won't run there. Marvin-AI and everything else still
  work in built-in mode. To use an AI on a public site, run server.py on a host that runs Python.

What each file does
  index.html             The page layout: the space intro, the three steps, results and details.
  css/styles.css         Colours, fonts, spacing and animation. Main colours are at the top (:root).
  js/i18n.js             All interface text in 15 languages.
                         Edit a sentence there, or copy the "en" block to add another language.
  js/intro.js            The space intro: starfield, the draggable Earth and the dive-in transition.
  js/audience.js         The audience bar and its panels.   css/audience.css   Their styling.
  js/briefing.js         The Introduction dialog opened by clicking the globe.
  js/app.js              The page logic: subjects and sliders, uploads, results, assessment and report.
                         The CONFIG block at the top holds the settings you are most likely to change
                         (Claude connection, default slider weights, bootstrap count). The built-in
                         Marvin chat is at the end of this file.
  js/analog-engine.js    The analysis itself. The same code as analog-engine.js and analog_engine.py.
  js/earth-texture.js    The NASA Blue Marble image used for the globe.
  js/examples.js         Example datasets for the "Load example" buttons. Delete it and its <script> tag
                         in index.html to remove the examples. The buttons then hide themselves.
  js/library.js          The data library catalog: 21 ready-made comparisons with their expected scores.
  data/                  The library's 30 data files (real NASA tables and map images), one small script
                         each. A file only loads when someone picks a set that uses it.
  server.py              Optional. Only for running the site locally with an optional Claude connection.
                         Not needed, and not used, on GitHub Pages.

Audience modes and themes
  The "Who is exploring?" bar at the top picks Auto-Detect, Kids, Students, Educators, Scientists or
  Managers (js/audience.js, css/audience.css). It sets the wording level (Kids, Teens, Students or
  Scientists), which sections are shown, and adds a panel for each group: a curriculum table for
  Educators (with an age dropdown), the stats and roughness matrix for Scientists, and a decision brief
  and investment analyzer for Managers. Nothing is calculated until you press Analyze or load a set from
  the library. The moon and sun button switches dark and light.
  Choices are remembered.

The intro
  Drag, flick or scroll to spin the Earth. Click it and an Introduction opens (js/briefing.js) naming the
  closest featured analog site to where you pressed, with a Launch Comparer button that fills in the
  site and takes you to the lab. "Skip the intro" goes straight to the lab.

How the overall score works
  Each subject you switch on gets its own likeness (0–100%). The overall likeness is the weighted mean,
  using the importance sliders: weight ÷ sum of weights of the switched-on subjects. A slider at 0 means
  that subject is shown but not counted. The overall uncertainty range combines each subject's
  bootstrap results.

Languages
  15 languages: English, Spanish, Bengali, Mandarin, Dutch, French, Japanese, Hindi, Arabic,
  Portuguese, Indonesian, Russian, German, Vietnamese and Afrikaans. Arabic switches the page to
  right-to-left. The interface is fully translated. Scientific tables, the methods text, error details and the
  built-in assessment stay in English. When Claude is connected, its assessment is written in the
  chosen language.

Marvin-AI (built-in helper)
  The "Ask Marvin-AI" button opens a chat that runs fully in the browser with no AI service and no key.
  It sees the page as it is: places, topics, slider weights, file names, error messages and every number
  in the results. It explains statistics and errors, answers about 45 common science questions, explains
  the audience modes, and suggests library datasets as buttons that load and run them. Ask who made it
  and it will tell you about its father, Marvin Wang.

Using an AI on your own computer or website
  Inside claude.ai the page uses Claude automatically. Elsewhere it needs a small server, because an API
  key must never be put in the page's code where visitors could read it.
  1. Install Python 3.9 or newer (nothing else to install).
  2. Choose an AI. The top of server.py shows each option:
       Claude:         export ANTHROPIC_API_KEY=your_key
       OpenAI-style:   export OPENAI_API_KEY=your_key  OPENAI_BASE_URL=service_url  AI_MODEL=model_name
       Free, local:    install Ollama, run  ollama pull llama3.1, then
                       export OPENAI_BASE_URL=http://localhost:11434/v1  AI_MODEL=llama3.1
     (On Windows use  set NAME=value  instead of export.)
  3. In this folder run:  python server.py   and open http://localhost:8000
  The page finds the server by itself and turns on the AI assessment, legend reading and Marvin-AI. It
  also shows the AI's name instead of "Claude" when you use another service.
  Without a server, everything else still works. The assessment is the built-in one, and map images need
  a manual colour key (chosen in each subject's options).
