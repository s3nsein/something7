/* The dataset library: real NASA data, ready to compare. Files live in data/<id>.js and load only when picked. */
window.LAB_LIBRARY = {
 "files": {
  "mars_gale_tes": {
   "name": "mars_gale_TES_2pm_surface_temp.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "Gale crater",
   "subject": "temperature",
   "source": "MGS TES, NASA PDS Geosciences Node",
   "note": "40,946 afternoon readings (1 to 3 PM), all seasons, 1999 to 2004.",
   "size": 1459961
  },
  "mars_gale_tes_c": {
   "name": "mars_gale_TES_celsius.tsv",
   "kind": "table",
   "format": "TSV",
   "world": "mars",
   "site": "Gale crater",
   "subject": "temperature",
   "source": "MGS TES, NASA PDS Geosciences Node",
   "note": "The same readings as a tab-separated file in °C, with different column names.",
   "size": 1418181
  },
  "mars_jezero_tes": {
   "name": "mars_jezero_TES_day_night.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "Jezero crater",
   "subject": "temperature",
   "source": "MGS TES, NASA PDS Geosciences Node",
   "note": "42,948 readings at about 2 PM and 2 AM, all seasons. Perseverance landed here.",
   "size": 1466457
  },
  "mars_olympus_tes": {
   "name": "mars_olympus_mons_TES_day_night.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "Olympus Mons",
   "subject": "temperature",
   "source": "MGS TES, NASA PDS Geosciences Node",
   "note": "581 readings from the summit caldera at about 2 PM and 2 AM, all seasons.",
   "size": 20660
  },
  "mars_gale_map_k": {
   "name": "mars_gale_TES_2pm_surface_temp.png",
   "kind": "image",
   "format": "PNG",
   "world": "mars",
   "site": "Gale crater",
   "subject": "temperature",
   "source": "MGS TES, NASA PDS Geosciences Node",
   "note": "Map of the Mars-year mean at 2 PM. Viridis scale, 230 to 340 K.",
   "size": 78183,
   "key": {
    "map": "viridis",
    "min": 230,
    "max": 340,
    "units": "K"
   }
  },
  "mars_gale_map_c": {
   "name": "mars_gale_map_inferno_celsius.png",
   "kind": "image",
   "format": "PNG",
   "world": "mars",
   "site": "Gale crater",
   "subject": "temperature",
   "source": "MGS TES, NASA PDS Geosciences Node",
   "note": "Map of the afternoon mean. Inferno scale, −45 to 25 °C.",
   "size": 60983,
   "key": {
    "map": "inferno",
    "min": -45,
    "max": 25,
    "units": "C"
   }
  },
  "earth_atacama_modis": {
   "name": "earth_atacama_MODIS_LST_day_2023.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "the Atacama Desert",
   "subject": "temperature",
   "source": "MODIS Aqua land surface temperature, NASA GIBS",
   "note": "33,585 monthly daytime readings (about 1:30 PM) for 2023.",
   "size": 1276286
  },
  "earth_atacama_modis_f": {
   "name": "earth_atacama_MODIS_fahrenheit.json",
   "kind": "table",
   "format": "JSON",
   "world": "earth",
   "site": "the Atacama Desert",
   "subject": "temperature",
   "source": "MODIS Aqua land surface temperature, NASA GIBS",
   "note": "The same readings as JSON in °F, with different key names.",
   "size": 3439960
  },
  "earth_atacama_map_k": {
   "name": "earth_atacama_MODIS_LST_day_2023.png",
   "kind": "image",
   "format": "PNG",
   "world": "earth",
   "site": "the Atacama Desert",
   "subject": "temperature",
   "source": "MODIS Aqua land surface temperature, NASA GIBS",
   "note": "Map of the 2023 daytime mean. Viridis scale, 230 to 340 K.",
   "size": 113189,
   "key": {
    "map": "viridis",
    "min": 230,
    "max": 340,
    "units": "K"
   }
  },
  "earth_atacama_map_f": {
   "name": "earth_atacama_map_jet_fahrenheit.png",
   "kind": "image",
   "format": "PNG",
   "world": "earth",
   "site": "the Atacama Desert",
   "subject": "temperature",
   "source": "MODIS Aqua land surface temperature, NASA GIBS",
   "note": "Map of the 2023 daytime mean. Jet scale, 60 to 140 °F.",
   "size": 94603,
   "key": {
    "map": "jet",
    "min": 60,
    "max": 140,
    "units": "F"
   }
  },
  "earth_devon": {
   "name": "earth_devon_island_haughton.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Haughton crater, Devon Island",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "Home of the Haughton-Mars Project. 8,760 hourly readings.",
   "size": 300542
  },
  "earth_svalbard": {
   "name": "earth_svalbard_bockfjorden.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Bockfjorden, Svalbard",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "Arctic volcanic site used for Mars rover tests (AMASE). 8,760 hourly readings.",
   "size": 289653
  },
  "earth_everest": {
   "name": "earth_everest_grid_cell.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Mount Everest",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "Grid cell averaging 4,855 m, below the 8,849 m summit. 8,760 hourly readings.",
   "size": 305072
  },
  "earth_mdrs": {
   "name": "earth_mdrs_utah.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "the Mars Desert Research Station, Utah",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "Where crews rehearse Mars missions. 8,760 hourly readings.",
   "size": 303948
  },
  "earth_dryvalleys": {
   "name": "earth_mcmurdo_dry_valleys.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "the McMurdo Dry Valleys",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "The coldest, driest Mars analog on Earth. 8,760 hourly readings.",
   "size": 314598
  },
  "earth_yungay": {
   "name": "earth_atacama_yungay.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Yungay, Atacama Desert",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "The driest part of the Atacama. 8,760 hourly readings, day and night.",
   "size": 304018
  },
  "earth_deathvalley": {
   "name": "earth_death_valley.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Death Valley",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "A hot desert used here as a control. 8,760 hourly readings.",
   "size": 303762
  },
  "earth_maunakea": {
   "name": "earth_mauna_kea.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Mauna Kea",
   "subject": "temperature",
   "source": "NASA POWER hourly surface skin temperature (TS), 2023, local solar time",
   "note": "Grid cell averaging 636 m, far below the 4,207 m summit. 8,760 hourly readings.",
   "size": 305864
  },
  "mars_gale_mola": {
   "name": "mars_gale_MOLA_topography.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "Gale crater",
   "subject": "topography",
   "source": "MGS MOLA gridded topography, NASA PDS Geosciences Node",
   "note": "65,536 heights on a 1/64° grid (about 925 m).",
   "size": 1596345
  },
  "earth_atacama_aster": {
   "name": "earth_atacama_ASTER_topography.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "the Atacama Desert",
   "subject": "topography",
   "source": "ASTER GDEM, NASA Earthdata (LP DAAC)",
   "note": "69,409 heights averaged to about 925 m.",
   "size": 1868469
  },
  "mars_gale_mola_map": {
   "name": "mars_gale_MOLA_elevation_map.png",
   "kind": "image",
   "format": "PNG",
   "world": "mars",
   "site": "Gale crater",
   "subject": "topography",
   "source": "MGS MOLA, NASA PDS Geosciences Node",
   "note": "Elevation map. Viridis scale, −5,000 to 1,500 m, about 287 m per pixel.",
   "size": 158934,
   "key": {
    "map": "viridis",
    "min": -5000,
    "max": 1500,
    "units": "m",
    "px": 287
   }
  },
  "earth_atacama_aster_map": {
   "name": "earth_atacama_ASTER_elevation_map.png",
   "kind": "image",
   "format": "PNG",
   "world": "earth",
   "site": "the Atacama Desert",
   "subject": "topography",
   "source": "ASTER GDEM, NASA Earthdata (LP DAAC)",
   "note": "Elevation map. Viridis scale, 0 to 7,000 m, about 296 m per pixel.",
   "size": 154005,
   "key": {
    "map": "viridis",
    "min": 0,
    "max": 7000,
    "units": "m",
    "px": 296
   }
  },
  "mars_gale_apxs": {
   "name": "mars_gale_APXS_sols_0_3076.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "Gale crater",
   "subject": "composition",
   "source": "Curiosity APXS, NASA PDS Geosciences Node",
   "note": "Rock and soil chemistry from sols 0 to 3,076.",
   "size": 306319
  },
  "mars_gale_soils": {
   "name": "mars_gale_soils_and_sands_APXS.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "Gale crater soils and sands",
   "subject": "composition",
   "source": "Curiosity APXS, NASA PDS Geosciences Node",
   "note": "Soil and sand targets only.",
   "size": 18678
  },
  "earth_chemcam_basalts": {
   "name": "earth_basalts_ChemCam_standards.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "ChemCam basalt standards",
   "subject": "composition",
   "source": "ChemCam calibration standards, NASA PDS",
   "note": "Earth basalts used to calibrate Curiosity’s laser instrument.",
   "size": 525
  },
  "earth_hawaii": {
   "name": "earth_hawaii_volcanic_rocks.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "Hawaiian basalts",
   "subject": "composition",
   "source": "USGS reference basalt BHVO-2 and published Mauna Kea analyses",
   "note": "A well-known Mars soil analog.",
   "size": 521
  },
  "earth_granite": {
   "name": "control_earth_granitic_rocks.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "granitic rocks",
   "subject": "composition",
   "source": "USGS reference granite and granodiorite",
   "note": "A control: continental rock unlike Mars soil.",
   "size": 436
  },
  "broken_nokey": {
   "name": "crater_temps_nokey.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "a crater",
   "subject": "temperature",
   "source": "Test file",
   "note": "No header row, so the lab cannot read it (E-NOKEY).",
   "size": 58
  },
  "broken_nounits_z": {
   "name": "crater_height_nounits.csv",
   "kind": "table",
   "format": "CSV",
   "world": "mars",
   "site": "a crater",
   "subject": "topography",
   "source": "Test file",
   "note": "A height column with no units (E-NOUNITS).",
   "size": 82
  },
  "broken_nounits_c": {
   "name": "earth_chemcam_standards_NO_UNITS.csv",
   "kind": "table",
   "format": "CSV",
   "world": "earth",
   "site": "ChemCam standards",
   "subject": "composition",
   "source": "Test file",
   "note": "Oxide columns with no units (E-NOUNITS).",
   "size": 1069
  }
 },
 "sets": [
  {
   "id": "t-gale-atacama",
   "subject": "temperature",
   "title": "Gale crater vs the Atacama Desert",
   "c": "mars_gale_tes",
   "e": "earth_atacama_modis",
   "kind": "starter",
   "blurb": "The classic pairing. Both are dry, but the Atacama is about 38 °C warmer at midday.",
   "body": "mars",
   "score": 30.5
  },
  {
   "id": "t-gale-atacama-maps",
   "subject": "temperature",
   "title": "Gale crater vs the Atacama, as map images",
   "c": "mars_gale_map_k",
   "e": "earth_atacama_map_k",
   "kind": "maps",
   "blurb": "The same places as color maps. Maps have no time or season, so only the temperatures count.",
   "body": "mars",
   "score": 9.5
  },
  {
   "id": "t-gale-atacama-units",
   "subject": "temperature",
   "title": "Same data, different formats and units",
   "c": "mars_gale_tes_c",
   "e": "earth_atacama_modis_f",
   "kind": "test",
   "blurb": "A Celsius TSV against a Fahrenheit JSON. The score should match the starter set.",
   "body": "mars",
   "score": 30.5
  },
  {
   "id": "t-gale-atacama-scales",
   "subject": "temperature",
   "title": "Same maps, different color scales",
   "c": "mars_gale_map_c",
   "e": "earth_atacama_map_f",
   "kind": "test",
   "blurb": "An inferno map in °C against a jet map in °F. Shows the lab reading any legend.",
   "body": "mars",
   "score": 9.1
  },
  {
   "id": "t-jezero-devon",
   "subject": "temperature",
   "title": "Jezero crater vs Devon Island",
   "c": "mars_jezero_tes",
   "e": "earth_devon",
   "kind": "analog",
   "blurb": "A polar desert crater that NASA has used for Mars field tests for over 20 years.",
   "body": "mars",
   "score": 26.7
  },
  {
   "id": "t-jezero-svalbard",
   "subject": "temperature",
   "title": "Jezero crater vs Svalbard",
   "c": "mars_jezero_tes",
   "e": "earth_svalbard",
   "kind": "analog",
   "blurb": "Arctic volcanoes and ice, where rover instruments for Mars were tested.",
   "body": "mars",
   "score": 26.2
  },
  {
   "id": "t-jezero-everest",
   "subject": "temperature",
   "title": "Jezero crater vs Mount Everest",
   "c": "mars_jezero_tes",
   "e": "earth_everest",
   "kind": "analog",
   "blurb": "High, cold and thin-aired, though Mars nights are far colder.",
   "body": "mars",
   "score": 26.8
  },
  {
   "id": "t-jezero-mdrs",
   "subject": "temperature",
   "title": "Jezero crater vs the Mars Desert Research Station",
   "c": "mars_jezero_tes",
   "e": "earth_mdrs",
   "kind": "analog",
   "blurb": "Utah desert where crews live like Mars astronauts for weeks.",
   "body": "mars",
   "score": 23.1
  },
  {
   "id": "t-jezero-dryvalleys",
   "subject": "temperature",
   "title": "Jezero crater vs the McMurdo Dry Valleys",
   "c": "mars_jezero_tes",
   "e": "earth_dryvalleys",
   "kind": "analog",
   "blurb": "The Dry Valleys match Mars for dryness and frozen ground, but they are colder than a Jezero afternoon.",
   "body": "mars",
   "score": 14.2
  },
  {
   "id": "t-jezero-yungay",
   "subject": "temperature",
   "title": "Jezero crater vs Yungay, Atacama",
   "c": "mars_jezero_tes",
   "e": "earth_yungay",
   "kind": "analog",
   "blurb": "A famous analog for dry soil and life, not for temperature.",
   "body": "mars",
   "score": 16.1
  },
  {
   "id": "t-jezero-deathvalley",
   "subject": "temperature",
   "title": "Jezero crater vs Death Valley (control)",
   "c": "mars_jezero_tes",
   "e": "earth_deathvalley",
   "kind": "control",
   "blurb": "A hot desert that should score low. Use it to check the lab is not fooled.",
   "body": "mars",
   "score": 17.2
  },
  {
   "id": "t-olympus-everest",
   "subject": "temperature",
   "title": "Olympus Mons vs Mount Everest",
   "c": "mars_olympus_tes",
   "e": "earth_everest",
   "kind": "analog",
   "blurb": "The tallest volcano in the solar system against the tallest mountain on Earth.",
   "body": "mars",
   "score": 19.6
  },
  {
   "id": "t-olympus-maunakea",
   "subject": "temperature",
   "title": "Olympus Mons vs Mauna Kea, with elevation correction",
   "c": "mars_olympus_tes",
   "e": "earth_maunakea",
   "kind": "demo",
   "blurb": "Two huge shield volcanoes. The Earth data are lowered by 6.5 °C per km to stand in for the 4,207 m summit.",
   "body": "mars",
   "score": 14.6,
   "elev": [
    636,
    4207,
    6.5
   ]
  },
  {
   "id": "z-gale-atacama",
   "subject": "topography",
   "title": "Gale crater vs the Atacama Desert (tables)",
   "c": "mars_gale_mola",
   "e": "earth_atacama_aster",
   "kind": "starter",
   "blurb": "A crater with a central mountain against the Andes foothills. The shapes are surprisingly alike.",
   "body": "mars",
   "score": 79.8
  },
  {
   "id": "z-gale-atacama-maps",
   "subject": "topography",
   "title": "Gale crater vs the Atacama, as elevation maps",
   "c": "mars_gale_mola_map",
   "e": "earth_atacama_aster_map",
   "kind": "maps",
   "blurb": "The same terrain as color maps, with pixel sizes filled in so slopes can be worked out.",
   "body": "mars",
   "score": 80.5
  },
  {
   "id": "c-gale-hawaii",
   "subject": "composition",
   "title": "Gale crater soils vs Hawaiian basalts",
   "c": "mars_gale_soils",
   "e": "earth_hawaii",
   "kind": "analog",
   "blurb": "Hawaiian basalt is a classic Mars soil analog. Expect a good partial match.",
   "body": "mars",
   "score": 49.8
  },
  {
   "id": "c-gale-granite",
   "subject": "composition",
   "title": "Gale crater soils vs granitic rocks (control)",
   "c": "mars_gale_soils",
   "e": "earth_granite",
   "kind": "control",
   "blurb": "Granite is continental rock that Mars barely has. It should score clearly lower.",
   "body": "mars",
   "score": 25.3
  },
  {
   "id": "c-gale-chemcam",
   "subject": "composition",
   "title": "Gale crater rocks vs ChemCam basalt standards",
   "c": "mars_gale_apxs",
   "e": "earth_chemcam_basalts",
   "kind": "analog",
   "blurb": "Every rock Curiosity measured against the Earth basalts used to calibrate its laser.",
   "body": "mars",
   "score": 58.4
  },
  {
   "id": "e-nokey",
   "subject": "temperature",
   "title": "Error test: a file with no header",
   "c": "broken_nokey",
   "e": "earth_atacama_modis",
   "kind": "error",
   "blurb": "Should stop with E-NOKEY and explain how to fix the file.",
   "body": "mars",
   "score": null
  },
  {
   "id": "e-nounits-z",
   "subject": "topography",
   "title": "Error test: heights with no units",
   "c": "broken_nounits_z",
   "e": "earth_atacama_aster",
   "kind": "error",
   "blurb": "Should stop with E-NOUNITS.",
   "body": "mars",
   "score": null
  },
  {
   "id": "e-nounits-c",
   "subject": "composition",
   "title": "Error test: oxides with no units",
   "c": "mars_gale_soils",
   "e": "broken_nounits_c",
   "kind": "error",
   "blurb": "Should stop with E-NOUNITS.",
   "body": "mars",
   "score": null
  }
 ]
};
