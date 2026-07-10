// subjects.js
const subjectsData = {
  subjects: [
    { id: "eng2", name: "Engineering", emoji: "⚙️", colour: "#0f4c81", storageKey: "eng2_topics", unitsKey: "eng2_units" },
    { id: "eco",  name: "Economics",   emoji: "📊", colour: "#0c8247", storageKey: "eco_topics",  unitsKey: "eco_units"  },
    { id: "eng",  name: "English",     emoji: "📖", colour: "#9f1239", storageKey: "eng_topics",  unitsKey: "eng_units"  },
    { id: "mth",  name: "Maths",       emoji: "📐", colour: "#1d4ed8", storageKey: "mth_topics",  unitsKey: "mth_units"  },
    { id: "tmb",  name: "Timber",      emoji: "🪵", colour: "#92400e", storageKey: "tmb_topics",  unitsKey: "tmb_units"  },
    { id: "mlt",  name: "Multimedia",  emoji: "🎬", colour: "#ce1ff1", storageKey: "mlt_topics",  unitsKey: "mlt_units"  },
    { id: "phy",  name: "Physics",     emoji: "🧪", colour: "#0dbb07", storageKey: "phy_topics",  unitsKey: "phy_units" }
  ]
};
// classes.js
//
// subjectId links each class to the subjectsData entry it belongs to.
// A class's own content (topics/units) is always stored separately, under
// the class's own storageKey/unitsKey — subjectId only tells the matching
// Subject page to also pull in and display that class's content alongside
// its own (see subject/subjectapp.js: LINKED_CLASSES / renderClassSections).
const classesData = {
  subjects: [
    { id: "2026-12A-mth",  subjectId: "mth",  name: "Maths", teacher: "H.Aldous", class: "A", emoji: "📐", colour: "#1d4ed8", storageKey: "2026-12A-mth_topics",  unitsKey: "2026-12A-mth_units"  },
    { id: "2026-12A-eng2", subjectId: "eng2", name: "Engineering", teacher: "D.Brennan", class: "A", emoji: "⚙️", colour: "#0f4c81", storageKey: "2026-12A-eng2_topics", unitsKey: "2026-12A-eng2_units" }  ]
};

