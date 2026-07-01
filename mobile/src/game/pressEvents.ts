/**
 * Press / locker-room decision events shown between games (Section 4).
 * Each choice swings team morale, the star's morale, the rest of the roster,
 * fan interest, and/or credits — creating emergent stories and attachment.
 */
export interface EventEffect {
  teamMorale?: number
  starMorale?: number
  othersMorale?: number
  fanInterest?: number
  credits?: number
}
export interface EventChoice {
  label: string
  result: string
  effect: EventEffect
}
export interface PressEvent {
  id: string
  speaker: string
  prompt: string
  choices: EventChoice[]
}

export const PRESS_EVENTS: PressEvent[] = [
  {
    id: 'star-shots',
    speaker: 'Your Star',
    prompt: 'Your star wants more shots. "Run the offense through me, Coach."',
    choices: [
      { label: 'Promise him the rock', result: 'He’s thrilled — the others, less so.', effect: { starMorale: 14, othersMorale: -6 } },
      { label: 'Stay balanced', result: 'A fair message. Nobody’s upset.', effect: { teamMorale: 2 } },
      { label: 'Bench him a game', result: 'Risky. The locker room is tense.', effect: { starMorale: -16, fanInterest: -5 } },
    ],
  },
  {
    id: 'reporter-tank',
    speaker: 'Beat Reporter',
    prompt: 'A reporter asks if you’re tanking for a better draft pick.',
    choices: [
      { label: 'Deny it firmly', result: 'Fans appreciate the fire.', effect: { fanInterest: 8 } },
      { label: 'Stay vague', result: 'The story fizzles out.', effect: {} },
      { label: 'Admit you’re building', result: 'Honest — but fans grumble.', effect: { fanInterest: -8, credits: 10 } },
    ],
  },
  {
    id: 'vet-mentor',
    speaker: 'Veteran Leader',
    prompt: 'Your veteran offers to mentor the young players on his own time.',
    choices: [
      { label: 'Embrace it', result: 'The whole roster feels the lift.', effect: { teamMorale: 8 } },
      { label: 'Politely decline', result: 'He shrugs it off.', effect: { starMorale: -4 } },
    ],
  },
  {
    id: 'charity',
    speaker: 'Front Office',
    prompt: 'The city invites the team to a charity event downtown.',
    choices: [
      { label: 'Send the whole team', result: 'The community loves it.', effect: { fanInterest: 12, teamMorale: 3 } },
      { label: 'Send a couple players', result: 'A modest showing.', effect: { fanInterest: 4 } },
      { label: 'Skip it — focus on ball', result: 'Fans notice the absence.', effect: { fanInterest: -6, teamMorale: 4 } },
    ],
  },
  {
    id: 'practice-fight',
    speaker: 'Assistant Coach',
    prompt: 'Two players got into it at practice.',
    choices: [
      { label: 'Make them settle it 1v1', result: 'Tension turns to respect.', effect: { teamMorale: 6 } },
      { label: 'Fine them both', result: 'Order restored, mood dampened.', effect: { teamMorale: -4, credits: 8 } },
      { label: 'Let it slide', result: 'It lingers in the locker room.', effect: { teamMorale: -7 } },
    ],
  },
  {
    id: 'sponsor',
    speaker: 'Marketing',
    prompt: 'A sponsor offers a jersey-patch deal — but the players hate the logo.',
    choices: [
      { label: 'Take the money', result: 'Cha-ching. The players sulk.', effect: { credits: 40, teamMorale: -6 } },
      { label: 'Negotiate a cleaner design', result: 'Smaller check, happier room.', effect: { credits: 18, teamMorale: 2 } },
      { label: 'Pass on it', result: 'The players respect the call.', effect: { teamMorale: 6 } },
    ],
  },
  {
    id: 'fan-vote',
    speaker: 'Fan Club',
    prompt: 'Fans are voting your star into the All-Star game.',
    choices: [
      { label: 'Rally the fanbase', result: 'The city goes wild.', effect: { fanInterest: 14, starMorale: 8 } },
      { label: 'Stay humble', result: 'Quiet confidence.', effect: { starMorale: 3 } },
    ],
  },
  {
    id: 'curfew',
    speaker: 'Team Captain',
    prompt: 'The captain asks you to lift the road-trip curfew.',
    choices: [
      { label: 'Lift it — trust them', result: 'The team feels respected.', effect: { teamMorale: 7, fanInterest: -3 } },
      { label: 'Keep it', result: 'Discipline holds.', effect: { teamMorale: -3 } },
    ],
  },
  {
    id: 'rookie-start',
    speaker: 'Scouting Dept.',
    prompt: 'Your rookie is outplaying a struggling vet in practice.',
    choices: [
      { label: 'Start the rookie', result: 'The kid is electric; the vet stews.', effect: { othersMorale: 5, starMorale: -8 } },
      { label: 'Stick with the vet', result: 'Loyalty noted, upside parked.', effect: { starMorale: 6, othersMorale: -3 } },
    ],
  },
  {
    id: 'gm-tradebait',
    speaker: 'General Manager',
    prompt: 'A rival offers a pile of credits for your sixth man.',
    choices: [
      { label: 'Cash in', result: 'Useful credits, thinner bench.', effect: { credits: 50, teamMorale: -5 } },
      { label: 'Keep your depth', result: 'The bench feels valued.', effect: { teamMorale: 4 } },
    ],
  },
  {
    id: 'social-media',
    speaker: 'PR Team',
    prompt: 'A player posted something spicy about the refs online.',
    choices: [
      { label: 'Back your player', result: 'Fans love the loyalty; league fines you.', effect: { teamMorale: 6, credits: -15, fanInterest: 6 } },
      { label: 'Make him delete it', result: 'Smart, if a little corporate.', effect: { teamMorale: -3 } },
    ],
  },
  {
    id: 'hometown',
    speaker: 'Local TV',
    prompt: 'A hometown kid on your bench is up for a community award.',
    choices: [
      { label: 'Promote it big', result: 'The city eats it up.', effect: { fanInterest: 11, teamMorale: 3 } },
      { label: 'Let him handle it', result: 'Low-key and classy.', effect: { teamMorale: 2 } },
    ],
  },
  {
    id: 'analytics',
    speaker: 'Analytics Hire',
    prompt: 'Your analytics staff wants the team to shoot way more threes.',
    choices: [
      { label: 'Embrace the numbers', result: 'The shooters are giddy.', effect: { starMorale: 6, othersMorale: 2 } },
      { label: 'Trust your eyes', result: 'Old-school. The staff sighs.', effect: { teamMorale: -2 } },
    ],
  },
  {
    id: 'injury-scare',
    speaker: 'Medical Staff',
    prompt: 'Your star tweaked an ankle — he says he can go.',
    choices: [
      { label: 'Rest him to be safe', result: 'Cautious; he’s frustrated but healthy.', effect: { starMorale: -5, teamMorale: 2 } },
      { label: 'Let him play', result: 'He guts it out — the room is fired up.', effect: { teamMorale: 6, starMorale: 4 } },
    ],
  },
  {
    id: 'mascot',
    speaker: 'Operations',
    prompt: 'Marketing wants a wild new mascot to boost the gate.',
    choices: [
      { label: 'Go big', result: 'Kids love it; credits flow.', effect: { fanInterest: 9, credits: 12 } },
      { label: 'Keep it classic', result: 'Tradition preserved.', effect: { fanInterest: -2 } },
    ],
  },
  {
    id: 'players-only',
    speaker: 'Locker Room',
    prompt: 'After a tough stretch, the players ask for a players-only meeting.',
    choices: [
      { label: 'Give them the room', result: 'They come out united.', effect: { teamMorale: 9 } },
      { label: 'Insist on coaching', result: 'They comply, a little deflated.', effect: { teamMorale: -4 } },
    ],
  },
]

export function pickEvent(): PressEvent {
  return PRESS_EVENTS[Math.floor(Math.random() * PRESS_EVENTS.length)]
}
