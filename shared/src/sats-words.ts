// Year 6 SATs Word Challenge Database
// Based on official KS2 English Grammar, Punctuation and Spelling Paper 2

export const SATS_CATEGORIES = {
  commonExceptions: 'Common Exception Words',
  prefixesSuffixes: 'Prefixes & Suffixes',
  homophones: 'Homophones',
  wordFamilies: 'Word Families',
  trickyEndings: 'Tricky Endings',
}

export const SATS_CHALLENGES = [
  // Common Exception Words (irregular spellings)
  {
    category: 'commonExceptions',
    sentences: [
      { text: "The _____ walked to school carefully.", answer: "pedestrian", hint: "Someone walking" },
      { text: "I felt _____ when I forgot my lines.", answer: "awkward", hint: "Uncomfortable" },
      { text: "The _____ of the mountain was breathtaking.", answer: "summit", hint: "Top peak" },
      { text: "She showed great _____ during the challenge.", answer: "courage", hint: "Bravery" },
      { text: "The _____ of the story was surprising.", answer: "conclusion", hint: "The end" },
      { text: "He made a _____ to study harder.", answer: "decision", hint: "Made up his mind" },
      { text: "The _____ performed tricks at the circus.", answer: "magician", hint: "Does magic tricks" },
      { text: "We need to _____ the instructions carefully.", answer: "describe", hint: "Tell about" },
      { text: "The _____ was covered in snow.", answer: "mountain", hint: "High hill" },
      { text: "She has a _____ collection of stamps.", answer: "variety", hint: "Many different types" },
    ]
  },
  
  // Words with -tion, -sion endings
  {
    category: 'prefixesSuffixes',
    sentences: [
      { text: "The _____ of the cake was delicious.", answer: "decoration", hint: "What makes it pretty" },
      { text: "There was a loud _____ from the kitchen.", answer: "explosion", hint: "Big bang" },
      { text: "The teacher gave us clear _____.", answer: "instructions", hint: "What to do" },
      { text: "The _____ was broadcast on television.", answer: "competition", hint: "Contest" },
      { text: "Her _____ was obvious to everyone.", answer: "ambition", hint: "Big goal" },
      { text: "The _____ took place in the hall.", answer: "performance", hint: "Show" },
      { text: "We studied the ancient _____.", answer: "civilisation", hint: "Old society" },
      { text: "The _____ required a lot of practice.", answer: "performance", hint: "Acting or playing" },
    ]
  },
  
  // Homophones (words that sound the same)
  {
    category: 'homophones',
    sentences: [
      { text: "_____ going to the shops later.", answer: "They're", hint: "They are" },
      { text: "The book is over _____.", answer: "there", hint: "That place" },
      { text: "_____ house is at the end of the road.", answer: "Their", hint: "Belongs to them" },
      { text: "I know _____ to find the answer.", answer: "where", hint: "Which place" },
      { text: "_____ jacket is this?", answer: "Whose", hint: "Belongs to whom" },
      { text: "The weather will _____ better tomorrow.", answer: "be", hint: "Is/am/are" },
      { text: "Please wait by the _____.", answer: "gate", hint: "Entrance" },
      { text: "She _____ the ball very far.", answer: "threw", hint: "Past of throw" },
    ]
  },
  
  // Word families (related words)
  {
    category: 'wordFamilies',
    sentences: [
      { text: "The _____ of the building was impressive.", answer: "structure", hint: "How it's built" },
      { text: "We need to _____ the problem.", answer: "construct", hint: "Build up" },
      { text: "The _____ was very destructive.", answer: "destruction", hint: "Causing damage" },
      { text: "Please _____ the instructions.", answer: "follow", hint: "Do as told" },
      { text: "She is a _____ of this school.", answer: "follower", hint: "One who follows" },
      { text: "The _____ was difficult to solve.", answer: "calculation", hint: "Maths problem" },
      { text: "We need to _____ the total.", answer: "calculate", hint: "Work out maths" },
    ]
  },
  
  // Tricky endings (-cial, -tial, -ture)
  {
    category: 'trickyEndings',
    sentences: [
      { text: "The _____ was absolutely huge.", answer: "creature", hint: "Living being" },
      { text: "We learned about _____ in science.", answer: "agriculture", hint: "Farming" },
      { text: "The _____ minister gave a speech.", answer: "official", hint: "Formal" },
      { text: "It was _____ that we would win.", answer: "essential", hint: "Very important" },
      { text: "The _____ of the building took years.", answer: "structure", hint: "Construction" },
      { text: "She showed great _____ in her work.", answer: "appreciation", hint: "Gratitude" },
    ]
  },
]

// Scoring
export const SCORING = {
  correctWord: 50,      // Points for correct spelling
  bonusSpeed: 25,       // Bonus for quick answer (<10 seconds)
  streakBonus: 10,      // Bonus per consecutive correct
  letterCollection: 10, // Points per letter collected
  letterDeposit: 5,     // Points per letter deposited
}

// Time limits
export const CHALLENGE_TIME = 60  // Seconds per challenge
