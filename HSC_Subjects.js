// HSC_Subjects.js
// Edit this file to manage your subjects, topics, and questions.
// Structure: subjects → topics → questions (each with q and a fields)

const HSC_Subjects = [
  {
    id: 'maths', name: 'Maths', icon: '📐', color: '#4f8ef7',
    topics: [
      {
        id: 'trig', name: 'Right Angle Trig',
        questions: [
          { q: 'What does sin(θ) equal in a right-angled triangle?', a: 'sin(θ) = opposite / hypotenuse. The sine of an angle is the ratio of the length of the side opposite that angle to the length of the hypotenuse.' },
          { q: 'What does cos(θ) equal in a right-angled triangle?', a: 'cos(θ) = adjacent / hypotenuse. The cosine of an angle is the ratio of the length of the adjacent side to the hypotenuse.' },
          { q: 'What does tan(θ) equal in a right-angled triangle?', a: 'tan(θ) = opposite / adjacent. Tangent is also equal to sin(θ) / cos(θ).' },
          { q: 'State the Pythagorean theorem.', a: 'a² + b² = c², where c is the hypotenuse and a, b are the two shorter sides.' },
          { q: 'If sin(θ) = 0.5, what is θ?', a: 'θ = 30° (or π/6 radians). This is one of the standard angle values worth memorising.' },
        ]
      },
      {
        id: 'cosine', name: 'Cosine Rule',
        questions: [
          { q: 'State the cosine rule for finding a side.', a: 'a² = b² + c² − 2bc·cos(A), where A is the angle opposite side a.' },
          { q: 'When do you use the cosine rule instead of the sine rule?', a: 'Use the cosine rule when you know two sides and the included angle (SAS), or all three sides (SSS).' },
          { q: 'Rearrange the cosine rule to find angle A.', a: 'cos(A) = (b² + c² − a²) / (2bc)' },
        ]
      },
      {
        id: 'rates', name: 'Rates and Ratios',
        questions: [
          { q: 'What is the formula for speed?', a: 'Speed = Distance ÷ Time. Units must be consistent — e.g. km/h or m/s.' },
          { q: 'How do you convert km/h to m/s?', a: 'Divide by 3.6. So 90 km/h = 90 ÷ 3.6 = 25 m/s.' },
          { q: 'A ratio of 3:5 means what fraction is the first quantity of the total?', a: '3/(3+5) = 3/8. The first quantity is three-eighths of the total.' },
        ]
      }
    ]
  },
  {
    id: 'engineering', name: 'Engineering', icon: '⚙️', color: '#a78bfa',
    topics: [
      {
        id: 'forces', name: 'Forces and Statics',
        questions: [
          { q: "State Newton's First Law of Motion.", a: "An object at rest stays at rest and an object in motion stays in motion with the same speed and direction unless acted upon by an unbalanced force." },
          { q: 'What is the unit of force?', a: 'The Newton (N). 1 N = 1 kg·m/s².' },
        ]
      },
      {
        id: 'materials', name: 'Properties of Materials',
        questions: [
          { q: 'What is tensile strength?', a: 'The maximum stress a material can withstand while being stretched before breaking.' },
          { q: 'Define ductility.', a: 'The ability of a material to be drawn into wire or deformed under tensile stress without fracturing.' },
        ]
      }
    ]
  },
  {
    id: 'economics', name: 'Economics', icon: '📈', color: '#34d399',
    topics: [
      {
        id: 'supply', name: 'Supply and Demand',
        questions: [
          { q: 'What happens to price when demand increases and supply is unchanged?', a: 'Price rises. Excess demand pushes buyers to bid higher, moving the equilibrium price up.' },
        ]
      }
    ]
  },
  {
    id: 'multimedia', name: 'Multimedia', icon: '🎬', color: '#fb923c',
    topics: [
      {
        id: 'lighting', name: 'Lighting',
        questions: [
          { q: 'What is three-point lighting?', a: 'A standard film/photography setup using a key light (main), fill light (reduces shadows), and back light (separates subject from background).' },
          { q: 'What is colour temperature measured in?', a: 'Kelvin (K). Warm light is around 2700–3000 K; daylight is around 5600 K; cool/blue is 6500 K+.' },
        ]
      },
      {
        id: 'cinematography', name: 'Cinematography',
        questions: [
          { q: 'What is the 180-degree rule?', a: 'The camera should stay on one side of an imaginary axis between subjects to maintain consistent screen direction and avoid disorienting the viewer.' },
        ]
      }
    ]
  },
  {
    id: 'physics', name: 'Physics', icon: '⚛️', color: '#f472b6',
    topics: []
  },
  {
    id: 'english', name: 'English', icon: '📖', color: '#94a3b8',
    topics: []
  },
  {
    id: 'timber', name: 'Timber', icon: '🪵', color: '#a16207',
    topics: []
  }
];